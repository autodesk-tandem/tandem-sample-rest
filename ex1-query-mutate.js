//Copyright 2022 Autodesk, Inc.
//All rights reserved.
//
//This computer source code and related instructions and comments are the
//unpublished confidential and proprietary information of Autodesk, Inc.
//and are protected under Federal copyright and state trade secret law.
//They may not be disclosed to, copied or used by any third party without
//the prior written consent of Autodesk, Inc.
//


const fetch = require("node-fetch");
const config = require("config");
const AdskAuth = require("./adsk-auth").AdskAuth;
const { ColumnFamilies } = require("./dt-schema");
const { toQualifiedKey } = require("./encode");

const host = config.get("TANDEM_HOST");
const apiUrl = `https://${host}/api/v1`;

// TODO: Add a specific facility URN to point to (which you can scrape from the browser address bar of a facility loaded into Tandem)
//Direct link to the facility: https://tandem-stg.autodesk.com/pages/facilities/urn:adsk.dtt:snFhpMynSjuNIl0yXdfbPw
//const facilityUrn = "urn:adsk.dtt:snFhpMynSjuNIl0yXdfbPw" //(LTU East Residence, TK account) Add your facility URN here
//const facilityUrn = "urn:adsk.dtt:Rpt8zwI8QPSijbc6p6xVVA" //(JMA_Test)
const facilityUrn = "urn:adsk.dtt:4Y3gKkNgTG-58yX-XmTtNA" //Small Medical

let g_headers;


async function queryElements(modelId, queryDef) {

	const scanReq = await fetch(`${apiUrl}/modeldata/${modelId}/scan`, {
		method: 'POST',
		headers: { ...g_headers,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(queryDef)
	});
	if(!scanReq.ok) {
		throw new Error(await scanReq.text());
	}

	const elements = await scanReq.json();
	// first array element is the response version, drop it
	elements.shift();

	return elements;
}


async function modifyElementProperty(modelId, mutations) {

	const mutateReq = await fetch(`${apiUrl}/modeldata/${modelId}/mutate`, {
		method: 'POST',
		headers: {
			...httpOptions.headers,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(mutations)
	});

	if(!mutateReq.ok) {
		throw new Error(await mutateReq.text());
	}

	return await mutateReq.text();
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
	console.log(JSON.stringify(settings, null, 2));

	// For each model (imported file) in this facility, list the available element properties
	// This is essentially the data schema. Note this is done in sequence for clarity, but the requests
	// can be made in parallel for better performance
	let modelSchemas = {};
	for (model of settings.links) {
		const schemaReq = await fetch(`${apiUrl}/modeldata/${model.modelId}/schema`, httpOptions);
		if(!schemaReq.ok) {
			throw new Error(await schemaReq.text());
		}
		const schema = await schemaReq.json();

		modelSchemas[model.modelId] = schema;

		//console.log(schema);
	}

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


	//Query specific properties -- this query will return all elements that have any of these properties set (not null).
	//This makes it possible to do more efficient two step queries, where one searches for some elements first, then
	//gets all their properties.
	//Normally this should be some "Tagged Asset" or Revit/source file property that is unique to the desired subset of elements,
	//for example Serial Number, Manufacturer, etc.
	//NOTE: Again, we make the queries sequentially, but they can be done in parallel for faster overall response time.
	const desiredColumns = ["[00 - Identity Data][Serial Number]"];
	let perModelAssets = {};
	for (let modelId in modelSchemas) {
		let modelProps = modelPropertyNameMaps[modelId];

		let queryColumns = [];

		for (let desiredColumn of desiredColumns) {

			let prop = modelProps[desiredColumn]
			if (prop) {
				queryColumns.push(prop.id);
			}
		}

		//This constituent model does not have elements with the desired properties, skip it
		if (queryColumns.length === 0) {
			continue;
		}

		//Perform the read query
		let queryDef = { qualifiedColumns: queryColumns };

		const elements = await queryElements(modelId, queryDef);

		//console.log(elements);

		perModelAssets[modelId] = elements.map(e => e.k);
	}

	//We now have a subset of elements (all elements with Serial Number). Let's query all their properties and save
	//them to a file
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
					console.warn("Unknown property", propId);
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
	console.log(JSON.stringify(allAssets, null, 2));


	//Update a specific property of a specific element.
	//We will look for PURY-P240,264,288YSKMU-A : PURY-P240YSKMU-A_460V_Non-Ducted by its serial number 123456

	//First, find the asset
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
	//We will modify the Warranty Expiration date
	let schema = modelPropertyNameMaps[foundAsset.modelId];
	let propDef = schema["[00 - Identity Data][Warranty Start Date]"];

	//We know that Warranty Expiration is a property of type "dateTime" and stores just a date,
	//which is formatted in ISO format.
	let newVal = new Date().toISOString().slice(0, 10);

	//check if the new value is different from the old value
	//(currently the server will accept updates regardless of there being a change, so the client needs to filter this out)
	skipUpdate = false;
	for (let prop of foundAsset.props) {
		if (prop.id === propDef.id) {
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
		let mutation = ["i", propDef.fam, propDef.col, newVal];

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

		let ourProp = rawData[propDef.id];

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

		const elements = queryElements(foundAsset.modelId, queryDef);

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
