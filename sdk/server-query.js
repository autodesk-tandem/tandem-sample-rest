import config from "config";
import fetch from "node-fetch";
import { AdskAuth } from "../adsk-auth.js";

export const host = config.get("TANDEM_HOST");
export const apiUrl = `https://${host}/api/v1`;

export let g_headers = {};

let auth;

export async function obtainAccessToken() {
	//Fetch an API access token
	auth = new AdskAuth();
	let accessToken = await auth.getToken("data:read data:write", 3600);

	g_headers["Authorization"] = "Bearer " + accessToken.access_token;
}

export async function queryElements(modelId, queryDef, resultSet, transformerFunc) {

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

	let result;
	if (transformerFunc) {
		result = elements.map(transformerFunc);
	} else {
		result = elements;
	}

	if (resultSet) {
		resultSet[modelId] = result;
	}

	return result;
}

export async function modifyElementProperty(modelId, mutations) {

	const mutateReq = await fetch(`${apiUrl}/modeldata/${modelId}/mutate`, {
		method: 'POST',
		headers: {
			...g_headers,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(mutations)
	});

	if(!mutateReq.ok) {
		throw new Error(await mutateReq.text());
	}

	return await mutateReq.text();
}

export async function createElement(modelId, mutations) {

	const mutateReq = await fetch(`${apiUrl}/modeldata/${modelId}/create`, {
		method: 'POST',
		headers: {
			...g_headers,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(mutations)
	});

	if(!mutateReq.ok) {
		throw new Error(await mutateReq.text());
	}

	return await mutateReq.text();
}

export async function getTwinSettings(twinId) {

	let httpOptions = { headers: g_headers };	

	const settingsReq = await fetch(`${apiUrl}/twins/${twinId}`, httpOptions);
	if(!settingsReq.ok) {
		throw new Error(await settingsReq.text());
	}

	const settings = await settingsReq.json();

	return settings;
}