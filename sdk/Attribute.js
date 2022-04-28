
import {ColumnFamilies} from "./dt-schema.js";

export const AttributeType =
{
    //Numeric types
    Unknown :       0,
    Boolean :       1,
    Integer :       2,
    Double :        3,
    Float:          4,

    //Special types
    BLOB :          10,
    DbKey:          11, /* represents a link to another object in the database, using database internal ID */

    //String types
    String:         20,
    LocalizableString: 21,
    DateTime:       22,    /* ISO 8601 date */
    GeoLocation :   23,    /* LatLonHeight - ISO6709 Annex H string, e.g: "+27.5916+086.5640+8850/" for Mount Everest */
    Position :      24,     /* "x y z w" space separated string representing vector with 2,3 or 4 elements*/

    Url:            25, /* URL string */
    //TODO: Do we need explicit logical types for any others?
};

//Bitmask values for boolean attribute options
export const AttributeFlags =
{
    afHidden    : 1 << 0, /* Attribute will not be displayed in default GUI property views. */
    afDontIndex : 1 << 1, /* NOT USED Attribute will not be indexed by the search service. */
    afDtHashV2  : 1 << 1, /* in DT storage, used for DtParams that use content based hash function rather than UUID. This use overrides AfDontIndex from Forge, which we don't use */
    afDirectStorage : 1 << 2,  /* NOT USED Attribute is not worth de-duplicating (e.g. vertex data or dbId reference) */
    afReadOnly : 1 << 3, /* Attribute is read-only (used when writing back to the design model, in e.g. Revit) */
    afDtParam : 1 << 4, /* Attribute is a native DT parameter */

    //Added post-Tandem to Forge here: https://git.autodesk.com/A360/platform-translation-propertydb/blob/master/propertydb/PropertyDatabase.h#L100
    afStable : 1 << 5 /* NOT USED Attribute value should be stable between file versions (e.g. Revit Element ID, AutoCAD Entity Handle) */
};

//Indicates what objects the attribute applies to. Can be a combination, for example, a setting of "et"
//means that the attribute applies to both elements and types
export const AttributeContext = {
	Element:  "e",
	Type:     "t",
	Space:    "s",
	Facility: "f",
	Logical:  "l",
};

export function isAttributeTypeNumeric(type) {
	return (
		type === AttributeType.Integer ||
		type === AttributeType.Double  ||
		type === AttributeType.Float
	);
}

export function isAttributeTypeDateTime(type) {
	return Number(type) === AttributeType.DateTime;
}

// Takes an input and parses it according to specified data type
// This is a useful helper when you need to apply some mutations to the property db from UI (data grid editing, bulk excel import, etc)
export function parseInputAttrValue(value, type, useDefault = true) {
	switch(type) {
		case AttributeType.DbKey:
		case AttributeType.Integer: {
			// empty
			if (value === undefined || value === '') {
				return undefined;
			}
			return useDefault ? Number.parseInt(value) || 0 : Number.parseInt(value);
		}
		case AttributeType.Double: {
			// empty
			if (value === undefined || value === '') {
				return undefined;
			}
			if (useDefault) {
				return Number(value) || 0;
			}
			// Number("") returns 0 in contrast to Number.parseInt/Float("") which return NaN
			// If we return two different values in these cases, we will have to test for empty strings in the UI, lets do it here
			if (value === "") {
				return Number.NaN;
			}
			return Number(value);
		}
		case AttributeType.Float: {
			// empty
			if (value === undefined || value === '') {
				return undefined;
			}
			return useDefault ? Number.parseFloat(value) || 0 : Number.parseFloat(value);
		}
		case AttributeType.String: return (value || "").toString();
		case AttributeType.DateTime: {
			return value || '';
		}
		case AttributeType.Boolean: {
			// empty
			if (value === undefined || value === '') {
				return undefined;
			}
			return typeof value === "boolean"
				? value ? 1 : 0
				: Number.parseInt(value || '0') ? 1 : 0;
		}
		default: return value;
	}
}

export class AttributeDef {

	constructor(attrId, attrSchema) {

		this.id = attrId;

		//attrName(0), category(1), dataType(2), dataTypeContext(3), description(4), displayName(5), flags(6), precision(7), forgeUnit(8)
		this.name = attrSchema[0];
		this.category = attrSchema[1];
		this.dataType = attrSchema[2];
		this.dataTypeContext = attrSchema[3];
		this.description = attrSchema[4];
		this.displayName = attrSchema[5];
		this.flags = attrSchema[6];
		this.precision = attrSchema[7];
		this.forgeUnit = attrSchema[8];

		//DT native atribute?
		if (attrSchema.length > 9) {
			this.forgeSymbol = attrSchema[9];
			this.forgeSpec = attrSchema[10];
			this.uuid = attrSchema[11];
			this.groupUuid = attrSchema[12];
			this.applicationFilter = attrSchema[13];
			this.allowedValues = attrSchema[14];
			this.context = attrSchema[15] || AttributeContext.Element;
		}

		//Computed in the same way as stored on the server side.
		//See https://git.autodesk.com/tandem/dt-server/blob/master/src/autodesk.com/double-trouble/btstore/attribute.go#L176
		//Generally the computation needs to be kept in sync for Excel import to work, not for talking to the server APIs, where
		//the attribute ID is used exclusively
		if (this.isNative()) {
			if (this.useHashV2()) {
				this.hash = `${ColumnFamilies.DtProperties}[${this.category}][${this.name}][${this.dataType}]`;
			} else {
				this.hash = `[${this.uuid}][${this.dataType}]`;
			}
		} else {
			this.hash = `[${this.category}][${this.name}][${this.forgeUnit || ""}][${this.forgeUnit ? "" : (this.dataTypeContext || "")}]`;
		}

		this.readOnly = Boolean(this.flags & AttributeFlags.afReadOnly);
		this.guessDataFormatType();
	}

	isNative() {
		return (this.flags & AttributeFlags.afDtParam) !== 0;
	}

	useHashV2() {
		return (this.flags & AttributeFlags.afDtHashV2) !== 0;
	}

	isHidden() {
		return (this.flags & AttributeFlags.afHidden) !== 0;
	}

	guessDataFormatType() {
		let attr = this;
		switch (attr.dataType) {
			case AttributeType.Boolean: attr.type = "boolean"; break;
			case AttributeType.Integer: attr.type = "integer"; break;
			case AttributeType.Float:
			case AttributeType.Double: attr.type = "number"; break;
		}

		if (attr.forgeUnit === "feet") {
			//TODO: The formatting for each Revit parameter is well known by Revit, but we have no way
			//to get it for pre-2021 Revit data. The below are just some examples to make a large subset of parameters look reasonable
			//E.g. look at what people do here: https://spiderinnet.typepad.com/blog/2014/08/revit-units-net-api-figure-out-revit-internal-units-per-unit-type.html
			const fr_inch = [ "Default Thickness", "Thickness", "Actual Tread Depth", "Actual Riser Height", "Tread Thickness", "Minimum Tread Depth", "Maximum Riser Height" ];
			const fr_feet_inch = ["Height Offset From Level", "Top Offset", "Base Offset", "Width", "Base Offset From Level"];

			//These map the hardcoded Forge Unit types used by Revit 2021 for the same thing
			if (fr_inch.indexOf(attr.name) >= 0) {
				attr.forgeUnit = "fractionalInches";
				attr.scaleFactor = 12; //Need this because fractionalInches will format the value like it's comin in inches, while here we map incoming "foot" unit to inches.
			} else if (fr_feet_inch.indexOf(attr.name) >= 0) {
				attr.forgeUnit = "feetFractionalInches";
			}
		}
	}

	formatAttrValue(val) {
		let attr = this;
		switch (attr.dataType) {
			case AttributeType.Boolean:
				return val === undefined ? undefined : val;
			case AttributeType.Integer:
				if (val === undefined) {
					return undefined;
				} else if (typeof val !== "number") {
					console.warn("Expected integer, but got", val);
					return parseInt(val);
				} else {
					return val;
				}
			case AttributeType.Float:
			case AttributeType.Double:
				if (val === undefined) {
					return undefined;
				} else if (typeof val !== "number") {
					console.warn("Expected number, but got", val);
					return parseFloat(val);
				} else {
					if (this.scaleFactor) {
						val *= this.scaleFactor;
					}

					if (Number.isSafeInteger(val)) {
						return val | 0;
					} else {
						return val;
					}
				}
			default: return val;
		}
	}


}
