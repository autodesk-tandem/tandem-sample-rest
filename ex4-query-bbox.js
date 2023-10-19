
import fetch from "node-fetch";
import { ColumnFamilies } from "./sdk/dt-schema.js";
import { apiUrl, g_headers, queryElements, obtainAccessToken, getTwinSettings } from "./sdk/server-query.js";

// TODO: Add a specific facility URN to point to (which you can scrape from the browser address bar of a facility loaded into Tandem)
//Direct link to the facility: https://tandem-stg.autodesk.com/pages/facilities/urn:adsk.dtt:GhUu1nxkSlSbH2JU113I_A
const facilityUrn = "urn:adsk.dtt:GhUu1nxkSlSbH2JU113I_A" //Small Medical

//Note that each bbox record is 28 bytes, 6 floats, plus 
//extra 4 bytes containing bit flags that we ignore here.
const BoxRecordSize = 28;

async function main() {


	//Fetch an API access token
	await obtainAccessToken();

	let httpOptions = { headers: g_headers };

	// Get facility details -- this will give us a list of all models that
	// make up the facility
	const settings = await getTwinSettings(facilityUrn);
	console.log(JSON.stringify(settings, null, 2));


	// For each model (imported file) in this facility, get the visualization metadata
	// Note this is done in sequence for clarity, but the requests
	// can be made in parallel for better performance
	let modelMetadata = {};
	for (let model of settings.links) {
		const vizMetadata = await fetch(`${apiUrl}/modeldata/${model.modelId}/model`, httpOptions);
		if(!vizMetadata.ok) {
			throw new Error(await vizMetadata.text());
		}

		modelMetadata[model.modelId] = await vizMetadata.json();
	}

	let perModelBoxes = {};
	for (let modelId in modelMetadata) {
		//Get the per-model global offset that gets the coordinates back into Revit model space
		let fo = modelMetadata[modelId].fragmentTransformsOffset;

		//Perform the read query
		let queryDef = { families: [ColumnFamilies.LMV] };

		await queryElements(modelId, queryDef, perModelBoxes, e => { 

			let buf = e["0:0"]?.[0] && Buffer.from(e["0:0"][0], "base64");
			let box = null;
			if (buf) {
				let minx = buf.readFloatLE(0) + fo.x;
				let miny = buf.readFloatLE(4) + fo.y;
				let minz = buf.readFloatLE(8) + fo.z;

				let maxx = buf.readFloatLE(12) + fo.x;
				let maxy = buf.readFloatLE(16) + fo.y;
				let maxz = buf.readFloatLE(20) + fo.z;

				//In some cases, elements can have multiple geometries,
				//so we have to combine multiple bounding boxes
				for (let i=BoxRecordSize; i<buf.length; i+= BoxRecordSize) {
					minx = Math.min(minx, buf.readFloatLE(i)   + fo.x);
					miny = Math.min(miny, buf.readFloatLE(i+4) + fo.y);
					minz = Math.min(minz, buf.readFloatLE(i+8) + fo.z);

					maxx = Math.max(maxx, buf.readFloatLE(i+12) + fo.x);
					maxy = Math.max(maxy, buf.readFloatLE(i+16) + fo.y);
					maxz = Math.max(maxz, buf.readFloatLE(i+20) + fo.z);
				}

				box = { minx, miny, minz, maxx, maxy, maxz };
			}
			
			return { k: e.k, box }
		});

		console.log(perModelBoxes[modelId]);
	}

}

main()
	.then(() => process.exit(0))
	.catch(e=>{
		console.error(e);
		process.exit(1);
	});
