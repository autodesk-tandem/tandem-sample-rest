
import fetch from "node-fetch";
import config from "config";
import { AdskAuth } from "./adsk-auth.js";
import { ColumnFamilies, QC } from "./sdk/dt-schema.js";
import { AttrSchema } from "./sdk/AttrSchema.js";
import { toQualifiedKey } from "./sdk/encode.js";

const host = config.get("TANDEM_HOST");
const apiUrl = `https://${host}/api/v1`;
const apiV2Url = `https://${host}/api/v2`;

// TODO: Add a specific facility URN to point to (which you can scrape from the browser address bar of a facility loaded into Tandem)
//Direct link to the facility: https://tandem-stg.autodesk.com/pages/facilities/urn:adsk.dtt:4Y3gKkNgTG-58yX-XmTtNA
const facilityUrn = "urn:adsk.dtt:GhUu1nxkSlSbH2JU113I_A" //Small Medical

let g_headers;


async function queryElements(modelId, queryDef, resultSet, transformerFunc) {

	const scanReq = await fetch(`${apiV2Url}/modeldata/${modelId}/scan`, {
		method: 'POST',
		headers: { ...g_headers,
			"Content-Type": "application/json",
		},
		compress: true,
		body: JSON.stringify(queryDef)
	});
	if(!scanReq.ok) {
		throw new Error(await scanReq.text());
	}

	const elements = await scanReq.json();
	// first array element is the response version, drop it
	elements.shift();

	if (transformerFunc)
		resultSet[modelId] = elements.map(transformerFunc);
	else
		resultSet[modelId] = elements;

}

async function querySchema(modelId, resultSet) {

	const schemaReq = await fetch(`${apiUrl}/modeldata/${modelId}/attrs`, {
		headers: g_headers
	});
	if(!schemaReq.ok) {
		throw new Error(await schemaReq.text());
	}
	const schema = await schemaReq.json();

	resultSet[modelId] = new AttrSchema(modelId, schema);

	//console.log(schema);
}


async function main() {


	//Fetch an API access token
	const auth = new AdskAuth();
	let accessToken = await auth.getToken("data:read data:write", 3600);

	g_headers = {
		Authorization: "Bearer " + accessToken.access_token
	};

	let httpOptions = { headers: g_headers };

	console.log("Got access token", accessToken);

	// Get facility details -- this will give us a list of all models that
	// make up the facility
	const settingsReq = await fetch(`${apiUrl}/twins/${facilityUrn}`, httpOptions);
	if(!settingsReq.ok) {
		throw new Error(await settingsReq.text());
	}

	const settings = await settingsReq.json();
	//console.log(JSON.stringify(settings, null, 2));

	// For each model (imported file) in this facility, list the available element properties
	// This is essentially the data schema.
	let modelSchemas = {};
	await Promise.all(settings.links.map(model => querySchema(model.modelId, modelSchemas)));

	let t0 = Date.now();

	//Query basic properties (name, category) of all elements. Do in parallel for all models in the facility
	let perModelAssets = {};
	let queryDef = { qualifiedColumns: [QC.CategoryId] };
	//let queryDef = { families: [ColumnFamilies.Standard] };

	await Promise.all(settings.links.map(model => queryElements(model.modelId, queryDef, perModelAssets, e => {
		return {key: e.k, catId: -2000000 - (0 | e[QC.CategoryId]?.[0])}
	})));

	let t1 = Date.now();
	console.log("Query execution time", t1 - t0);

	//We now have information about all elements. Let's choose a subset based on Revit Category
	//and get their full properties
	let perModelAssetProps = {};

	await Promise.all(settings.links.map(model => {

		let elList = perModelAssets[model.modelId];

		let keyList = [];

		for (let elInfo of elList) {
			//Searches for all Mechanical Equipment
			if (elInfo.catId === -2001140) {
				keyList.push(elInfo.key);
			}
		}

		//This model didn't have any matching assets, skip it
		if (!keyList || !keyList.length) {
			return;
		}

		let queryDef = {
			keys: keyList,
			families: [ColumnFamilies.Standard, ColumnFamilies.Source, ColumnFamilies.DtProperties, ColumnFamilies.Refs] //TODO: This needs to be fixed on the server side -- seems like empty families query returns just Revit properties
		}

		return queryElements(model.modelId, queryDef, perModelAssetProps);

	}));

	//Format the asset property data for output, e.g CSV, JSON etc
	let allAssets = [];

	for (let modelId in perModelAssetProps) {

		//Get the schame for this model
		let schema = modelSchemas[modelId];

		//Loop over the query result for each element and convert the returned
		//property data to human readable format
		for (let rawProps of perModelAssetProps[modelId]) {

			let niceProps = {
				modelId: modelId,
				elementId: rawProps.k,
				props: []
			};

			for (let propId in rawProps) {
				if (propId == "k") continue;

				let [colFam, colName] = propId.split(":");

				let propDef = schema.findAttributeById(colName);
				if (!propDef) {
					//console.warn("Unknown property", propId);
					continue;
				}

				//Skip Revit design properties from output
				if (propDef.fam === ColumnFamilies.Source) {
					continue;
				}

				niceProps.props.push({
					colFam,
					colName,
					qId: propId,
					name: propDef ? propDef.name : propId,
					value: rawProps[propId][0]
				})
			}

			allAssets.push(niceProps);
		}
	}

	//Print all assets' properties as JSON
	console.log(JSON.stringify(allAssets, null, 2));


	return;
}

main()
	.then(() => process.exit(0))
	.catch(e=>{
		console.error(e);
		process.exit(1);
	});
