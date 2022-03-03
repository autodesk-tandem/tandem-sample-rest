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
import { AttrSchema } from "./sdk/AttrSchema.js";
import { AdskAuth } from "./adsk-auth.js"

const host = config.get("TANDEM_HOST");
const apiUrl = `https://${host}/api/v1`;

// TODO: Add a specific facility URN to point to (which you can scrape from the browser address bar of a facility loaded into Tandem)
//Direct link to the facility: https://tandem-stg.autodesk.com/pages/facilities/urn:adsk.dtt:4Y3gKkNgTG-58yX-XmTtNA
const facilityUrn = "urn:adsk.dtt:4Y3gKkNgTG-58yX-XmTtNA" //Small Medical

let g_headers;


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
	for (let model of settings.links) {
		const schemaReq = await fetch(`${apiUrl}/modeldata/${model.modelId}/attrs`, httpOptions);
		if(!schemaReq.ok) {
			throw new Error(await schemaReq.text());
		}
		const schema = await schemaReq.json();

		modelSchemas[model.modelId] = new AttrSchema(model.modelId, schema);

		//console.log(schema);
	}

	return;
}

main()
	.then(() => process.exit(0))
	.catch(e=>{
		console.error(e);
		process.exit(1);
	});
