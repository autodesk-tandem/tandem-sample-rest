//Copyright 2022 Autodesk, Inc.
//All rights reserved.
//
//This computer source code and related instructions and comments are the
//unpublished confidential and proprietary information of Autodesk, Inc.
//and are protected under Federal copyright and state trade secret law.
//They may not be disclosed to, copied or used by any third party without
//the prior written consent of Autodesk, Inc.
//

const { ElementFlags } = require("./dt-schema");

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

module.exports = {
	toQualifiedKey
};