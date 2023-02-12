import fetch from "node-fetch";
import config from "config";
import { AdskAuth } from "./adsk-auth.js";
import { ColumnFamilies, ColumnNames, ElementFlags, QC } from "./sdk/dt-schema.js";
import { AttrSchema } from "./sdk/AttrSchema.js";
import { makeWebsafe, toQualifiedKey } from "./sdk/encode.js";
import { createElement, getTwinSettings, g_headers, obtainAccessToken, queryElements } from "./sdk/server-query.js";
import crypto from "crypto"
import { gzip, gzipSync } from "zlib";

const host = config.get("TANDEM_HOST");
const apiUrl = `https://${host}/api/v1`;

// TODO: Add a specific facility URN to point to (which you can scrape from the browser address bar of a facility loaded into Tandem)
//Direct link to the facility: https://tandem-stg.autodesk.com/pages/facilities/urn:adsk.dtt:4Y3gKkNgTG-58yX-XmTtNA
const facilityUrn = "urn:adsk.dtt:7N1I8wsmTX-tV9kjuwvuVQ" 

async function createStreams() {


	//Fetch an API access token
	await obtainAccessToken();

	// Get facility details -- this will give us a list of all models that
	// make up the facility
	const settings = await getTwinSettings(facilityUrn);
	console.log(JSON.stringify(settings, null, 2));

	//Get the list of rooms
	let mainModel = settings.links.find(m => m.main);
	console.log("Main model", mainModel);

	//List all elements from the main model file, asking for standard Tandem properties, plus Level link
	let allElements = await queryElements(mainModel.modelId, { families: [ColumnFamilies.Standard], qualifiedColumns: [QC.Level] }, null, null );

	//Filter by Revit categorys, which for rooms is -2000160 (or just 160 in Tandem)
	let rooms = allElements.filter(row => row["n:c"]?.[0] === 160);

	console.log("Rooms", rooms.length);

	let modelIdBin = Buffer.from(mainModel.modelId.slice(13), "base64");

	let defaultModel = settings.links.find(m => facilityUrn.endsWith(m.modelId.slice(13)));

	//Create one data connection (element) per room
	for (let i=0; i<rooms.length; i++) {
		let room = rooms[i];
/*
		let sensorKey = "sensor:" + room.k;

		var shasum = crypto.createHash('sha1')
		shasum.update(sensorKey)
		let sensorId = shasum.digest('base64');

		let sensorQid = toQualifiedKey(sensorId, true);

		console.log(sensorQid);
*/
		let roomName = room["n:n"][0];
		let roomIdBin = Buffer.from(room.k, "base64");

		let roomXref = makeWebsafe(Buffer.concat([modelIdBin, roomIdBin]).toString("base64"));
		
		let details = {
			muts: [
				["i", ColumnFamilies.Standard, ColumnNames.Name, roomName],
				["i", ColumnFamilies.Standard, ColumnNames.ElementFlags, ElementFlags.Stream],
				["i", ColumnFamilies.Standard, ColumnNames.UniformatClass, "D7070"],
				["i", ColumnFamilies.Standard, ColumnNames.Classification, "03.DD"],
				["i", ColumnFamilies.Standard, ColumnNames.CategoryId, 8083],
				["i", ColumnFamilies.Xrefs, ColumnNames.Parent, roomXref],
				["i", ColumnFamilies.Xrefs, ColumnNames.Rooms, roomXref],
			]
		};

		
		let res = await createElement(defaultModel.modelId, details);
		console.log(res);
	};
}

function createStreamData(howMany) {

	const yearMinutes = 365 * 24 * 60;
	const dayMinutes = 24 * 60;
	const weekMinutes = 7 * dayMinutes;
	const minuteMs = 60000;

	let nowMs = Date.now();
	let yearAgo = nowMs - yearMinutes * minuteMs;

	let samples = [];
	
	let rndOffset = Math.random() - 0.5;
	let rndScale = Math.random();

	let lastCO2 = 400 + 20 * (Math.random() - 0.5);

	if (!howMany) {
		howMany = yearMinutes
	}

	for (let min = 0; min < howMany; min++) {

		let dayMin = min % dayMinutes;
		
		let temp = 21 + rndOffset + 5 * rndScale * Math.sin(2 * Math.PI / dayMinutes * dayMin);

		let changeCO2 = Math.random() < 0.1;
		let co2 = lastCO2;
		if (changeCO2) {
			co2 = 400 + 50 * (Math.random() - 0.5);
			lastCO2 = co2;
		}

		let weekMin = min % weekMinutes;
		let hum = 60 + 20 * Math.sin(2 * Math.PI / dayMinutes * dayMin + rndOffset) * Math.cos(2 * Math.PI / weekMinutes * weekMin);

		let sample = {
			ts: yearAgo + min * minuteMs,
			temp,
			co2,
			hum
		}
		
		samples.push(sample);
	}

	return samples;
}

async function populateStreams() {

	//Fetch an API access token
	await obtainAccessToken();

	// Get facility details -- this will give us a list of all models that
	// make up the facility
	const settings = await getTwinSettings(facilityUrn);
	console.log(JSON.stringify(settings, null, 2));
	
	let defaultModel = settings.links.find(m => facilityUrn.endsWith(m.modelId.slice(13)));

	let allElements = await queryElements(defaultModel.modelId, { families: [ColumnFamilies.Standard] }, null, null );

	let streams = allElements.filter(row => row["n:a"][0] === ElementFlags.Stream);
	let keys = streams.map(row => row.k);

	let httpOptions = { headers: g_headers, method: "POST", body: JSON.stringify({keys})};

	const secretsReq = await fetch(`${apiUrl}/models/${defaultModel.modelId}/getstreamssecrets`, httpOptions);
	
	const secrets = await secretsReq.json();

	//console.log(secrets);

	let count = 0;

	for (let streamKey in secrets) {

		count++;
		console.log(count);

		let samples = createStreamData();
		
		for (let i=0; i<samples.length; i+= 2000) {

			let start = i;
			let end = Math.min(i+2000, samples.length);
			let data = samples.slice(start, end);

			let post = {
				method: "POST",
				//body: gzipSync(JSON.stringify(samples)),
				body: JSON.stringify(data),
				headers: {
					"Authorization": "Basic " + Buffer.from(":" + secrets[streamKey]).toString("base64"),
					"Content-Type": "application/json",
					//"Content-Encoding": "gzip"
				}
			}

			let res = await fetch(`https://tandem-stg.autodesk.com/api/v1/timeseries/models/${defaultModel.modelId}/streams/${streamKey}`, post);

			let txt = await res.text();
			console.log(txt);
		}
	}

}


populateStreams()
	.then(() => process.exit(0))
	.catch(e=>{
		console.error(e);
		process.exit(1);
	});

