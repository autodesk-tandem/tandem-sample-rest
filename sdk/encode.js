
import { ElementFlags } from "./dt-schema.js";

function makeWebsafe(urn) {
	return urn.replace(/\+/g, '-') // Convert '+' to '-' (dash)
		.replace(/\//g, '_') // Convert '/' to '_' (underscore)
		.replace(/=+$/, ''); // Remove trailing '='
}

function toQualifiedKey(shortKey, isLogicalElement) {
	let binData = Buffer.from(shortKey, "base64");
	let fullKey = Buffer.alloc(24);

	fullKey.writeInt32BE(isLogicalElement ? ElementFlags.FamilyType : ElementFlags.SimpleElement);
	binData.copy(fullKey, 4);

	return makeWebsafe(fullKey.toString("base64"));
}

export {
	toQualifiedKey,
	makeWebsafe
};
