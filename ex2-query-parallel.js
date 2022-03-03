//Copyright 2022 Autodesk, Inc.
//All rights reserved.
//
//This computer source code and related instructions and comments are the
//unpublished confidential and proprietary information of Autodesk, Inc.
//and are protected under Federal copyright and state trade secret law.
//They may not be disclosed to, copied or used by any third party without
//the prior written consent of Autodesk, Inc.
//


import fetch from "node-fetch";
import config from "config";
import { AdskAuth } from "./adsk-auth.js";
import { ColumnFamilies, QC } from "./sdk/dt-schema.js";
import { toQualifiedKey } from "./sdk/encode.js";

const host = config.get("TANDEM_HOST");
const apiUrl = `https://${host}/api/v1`;

// TODO: Add a specific facility URN to point to (which you can scrape from the browser address bar of a facility loaded into Tandem)
//Direct link to the facility: https://tandem-stg.autodesk.com/pages/facilities/urn:adsk.dtt:snFhpMynSjuNIl0yXdfbPw
//const facilityUrn = "urn:adsk.dtt:snFhpMynSjuNIl0yXdfbPw" //(LTU East Residence, TK account) Add your facility URN here
//const facilityUrn = "urn:adsk.dtt:Rpt8zwI8QPSijbc6p6xVVA" //(JMA_Test)
//const facilityUrn = "urn:adsk.dtt:4Y3gKkNgTG-58yX-XmTtNA" //Small Medical
const facilityUrn = "urn:adsk.dtt:u16vTTS2RLStz4sUpk5Ekw" //Norconsult (confidential)

let g_headers;


async function queryElements(modelId, queryDef, resultSet, transformerFunc) {

	const scanReq = await fetch(`${apiUrl}/modeldata/${modelId}/scan`, {
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

	const schemaReq = await fetch(`${apiUrl}/modeldata/${modelId}/schema`, {
		headers: g_headers
	});
	if(!schemaReq.ok) {
		throw new Error(await schemaReq.text());
	}
	const schema = await schemaReq.json();

	resultSet[modelId] = schema;

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

	//Create a map of property name -> property id, and vice versa so that we
	//can look up the desired properties in each model. Note that the same properties
	//may have different internal IDs in each constituent model, which is why it's important
	//to track this per model.
	let modelPropertyNameMaps = {};
	let modelPropertyIdMaps = {};
	for (let modelId in modelSchemas) {
		let modelPropsList = modelSchemas[modelId];

		let propNameMap = modelPropertyNameMaps[modelId] = {};
		let propIdMap = modelPropertyIdMaps[modelId] = {};

		for (let colDef of modelPropsList.attributes) {

			let propKey = `[${colDef.category}][${colDef.name}]`;
			propNameMap[propKey] = colDef;

			propIdMap[colDef.id] = colDef;
		}
	}

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
				keyList.push(toQualifiedKey(elInfo.key));
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
		let propIdMap = modelPropertyIdMaps[modelId];

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

				let propDef = propIdMap[propId];
				if (!propDef) {
					//console.warn("Unknown property", propId);
					continue;
				}

				//Skip Revit design properties from output
				if (propDef.fam === ColumnFamilies.Source) {
					continue;
				}

				niceProps.props.push({
					id: propId,
					name: propDef ? propDef.name : propId,
					value: rawProps[propId][0]
				})
			}

			allAssets.push(niceProps);
		}
	}

	//Print all assets' properties as JSON
	//console.log(JSON.stringify(allAssets, null, 2));


	return;
}

main()
	.then(() => process.exit(0))
	.catch(e=>{
		console.error(e);
		process.exit(1);
	});
