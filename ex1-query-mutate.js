
import fetch from "node-fetch";
import { ColumnFamilies } from "./sdk/dt-schema.js";
import { toQualifiedKey } from "./sdk/encode.js";
import { AttrSchema } from "./sdk/AttrSchema.js";
import { apiUrl, g_headers, queryElements, modifyElementProperty, obtainAccessToken, getTwinSettings } from "./sdk/server-query.js";

// TODO: Add a specific facility URN to point to (which you can scrape from the browser address bar of a facility loaded into Tandem)
//Direct link to the facility: https://tandem-stg.autodesk.com/pages/facilities/urn:adsk.dtt:GhUu1nxkSlSbH2JU113I_A
const facilityUrn = "urn:adsk.dtt:GhUu1nxkSlSbH2JU113I_A" //Small Medical

async function main() {


	//Fetch an API access token
	await obtainAccessToken();

	let httpOptions = { headers: g_headers };

	// Get facility details -- this will give us a list of all models that
	// make up the facility
	const settings = await getTwinSettings(facilityUrn);
	console.log(JSON.stringify(settings, null, 2));



	// For each model (imported file) in this facility, list the available element properties
	// This is essentially the data schema. Note this is done in sequence for clarity, but the requests
	// can be made in parallel for better performance
	let modelSchemas = {};
	for (let model of settings.links) {
		const schemaReq = await fetch(`${apiUrl}/modeldata/${model.modelId}/attrs`, httpOptions);
		if(!schemaReq.ok) {
			throw new Error(await schemaReq.text());
		}
		const schema = await schemaReq.json();

		modelSchemas[model.modelId] = new AttrSchema(model.modelId, schema);

		//console.log(schema);
	}







	//Query specific properties -- this query will return all elements that have any of these properties set (not null).
	//This makes it possible to do more efficient two step queries, where one searches for some elements first, then
	//gets all their properties.
	//Normally this should be some "Tagged Asset" or Revit/source file property that is unique to the desired subset of elements,
	//for example Serial Number, Manufacturer, etc.
	//NOTE: Again, we make the queries sequentially, but they can be done in parallel for faster overall response time.
	let perModelAssets = {};
	for (let modelId in modelSchemas) {
		let schema = modelSchemas[modelId];

		let queryColumns = [];

		let prop = schema.findAttribute("General", "Serial Number");
		if (prop) {
			//We know that the property we are looking for is one added
			//via custom Tandem properties template, so we add the name prefix to it directly
			queryColumns.push(ColumnFamilies.DtProperties +":"+ prop.id);
		}

		//This constituent model does not have elements with the desired properties, skip it
		if (queryColumns.length === 0) {
			continue;
		}

		//Perform the read query
		let queryDef = { qualifiedColumns: queryColumns };

		await queryElements(modelId, queryDef, perModelAssets, e => e.k);

		//console.log(perModelAssets[modelId]);
	}






	//We now have a subset of elements (all elements with Serial Number). Let's query all their properties 
	let perModelAssetProps = {};

	for (let modelId in perModelAssets) {

		let keyList = perModelAssets[modelId];

		//This model didn't have any matching assets, skip it
		if (!keyList || !keyList.length) {
			continue;
		}

		let queryDef = {
			keys: perModelAssets[modelId],
			families: [ColumnFamilies.Standard, ColumnFamilies.Source, ColumnFamilies.DtProperties, ColumnFamilies.Refs] //TODO: This needs to be fixed on the server side -- seems like empty families query returns just Revit properties
		}

		const elements = await queryElements(modelId, queryDef);

		console.log(elements);

		perModelAssetProps[modelId] = elements;
	}


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

				let propDef = schema.findAttributeById(propId.split(":")[1]);
				if (!propDef) {
					console.warn("Unknown property", propId);
					continue;
				}

				//Skip Revit design properties from output
				if (propDef.fam === ColumnFamilies.Source) {
					continue;
				}

				let [colFam, colName] = propId.split(":");

				niceProps.props.push({
					colFam: colFam,
					colName: colName,
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








	//Update a specific property of a specific element.
	//We will look for an object by its Serial Number 123456

	//First, find the asset in the list of assets with Serial Number that we got above
	let foundAsset;
	for (let asset of allAssets) {
		for (let prop of asset.props) {
			if (prop.name === "Serial Number") {
				if (prop.value === "123456") {
					foundAsset = asset;
					break;
				}
			}
		}
	}

	if (!foundAsset) {
		console.error("Failed to find target asset");
		return;
	}

	console.log("Found asset", foundAsset);



	//Modify (or insert) a property value for this asset.
	//We will modify the Installation Date
	let schema = modelSchemas[foundAsset.modelId];
	let propDef = schema.findAttribute("General", "Installation Date");

	//We know that it is a property of type "dateTime" and stores just a date,
	//which is formatted in ISO format.
	let newVal = new Date().toISOString().slice(0, 10);

	//check if the new value is different from the old value
	//(currently the server will accept updates regardless of there being a change, so the client needs to filter this out)
	let skipUpdate = false;
	for (let prop of foundAsset.props) {
		if (prop.colName === propDef.id) {
			if (prop.value === newVal) {
				skipUpdate = true;
			}
		}
	}

	if (skipUpdate) {
		console.log("Skipping property update, because value is not changing");
	} else {

		//This defines an update of one specific property of one element.
		//Multiple such updates can be sent with a single POST request, and updates
		//to the same element will be done atomically.
		let mutation = ["i", ColumnFamilies.DtProperties, propDef.id, newVal];

		let payload = {
			// note that keys and mutations need to have the same length
			keys: [foundAsset.elementId],
			muts: [mutation]
		}

		await modifyElementProperty(foundAsset.modelId, payload);

		console.log('Mutation succeeded');
	}






	//Query properties of the updated elements, including change history
	{
		let queryDef = {
			keys: [foundAsset.elementId],
			families: [ColumnFamilies.Standard, ColumnFamilies.DtProperties],
			includeHistory: true
		}

		const elements = await queryElements(foundAsset.modelId, queryDef);

		console.log(elements);

		if (!elements.length) {
			console.log("unexpected -- no element found");
		}

		let rawData = elements[0];

		let ourProp = rawData[ColumnFamilies.DtProperties +":"+ propDef.id];

		//Find the property we modified above and print its change history
		console.log("Change history for", propDef.name);
		for (let i=0; i<ourProp.length; i+=2) {
			let val = ourProp[i];
			let timestamp = ourProp[i+1];

			console.log(`Value: ${val} set on ${new Date(timestamp).toString()}`);
		}
	}




	
	//Query a reference to another database element (like the Family Type)
	{
		let typeId;
		for (let i=0; i<foundAsset.props.length; i++) {
			let prop = foundAsset.props[i];

			if (prop.name === "Family Type") {
				typeId = prop.value;
				break;
			}
		}

		let qualifiedEncodedId = toQualifiedKey(typeId, true);

		let queryDef = {
			keys: [qualifiedEncodedId],
			families: [ColumnFamilies.Standard, ColumnFamilies.DtProperties, ColumnFamilies.Source],
			includeHistory: true
		}

		const elements = await queryElements(foundAsset.modelId, queryDef);

		console.log(elements);
	}

	return;
}

main()
	.then(() => process.exit(0))
	.catch(e=>{
		console.error(e);
		process.exit(1);
	});
