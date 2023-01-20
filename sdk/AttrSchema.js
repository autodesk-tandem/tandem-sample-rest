import { AttributeDef, AttributeType, AttributeFlags } from "./Attribute.js";
import { QC, ColumnNames, ColumnFamilies } from "./dt-schema.js";

const StandardAttributes = {
	[QC.RowKey] :         Object.freeze(new AttributeDef(QC.RowKey,        ['externalId', 'ID', AttributeType.String, null, '', '', AttributeFlags.afHidden|AttributeFlags.afReadOnly, 0, '', '', '', ColumnNames.ElementFlags, ColumnFamilies.Standard, null])),

	[QC.LmvDbId] :        Object.freeze(new AttributeDef(QC.LmvDbId,       ['dbid', 'ID', AttributeType.DbKey, null, '', '', AttributeFlags.afHidden|AttributeFlags.afReadOnly, 0, '', '', '', ColumnNames.ElementFlags, ColumnFamilies.Standard, null])),
	[QC.ElementFlags]:    Object.freeze(new AttributeDef(QC.ElementFlags,  ['Flags', 'Common', AttributeType.Integer, null, '', '', AttributeFlags.afReadOnly, 0, '', '', '', ColumnNames.ElementFlags, ColumnFamilies.Standard, null])),
	[QC.SystemClass]:     Object.freeze(new AttributeDef(QC.SystemClass,   ['System Class', 'Common', AttributeType.Integer, null, '', '', 0, 0, '', '', '', ColumnNames.SystemClass, ColumnFamilies.Standard, null])),
	[QC.OSystemClass]:    Object.freeze(new AttributeDef(QC.OSystemClass,  ['System Class Override', 'Common', AttributeType.Integer, null, '', '', 0, 0, '', '', '', ColumnNames.OSystemClass, ColumnFamilies.Standard, null])),	
	[QC.Name]  :          Object.freeze(new AttributeDef(QC.Name,          ['Name',   'Common',  AttributeType.String, null, '', '', 0, 0, '', '', '', ColumnNames.Name, ColumnFamilies.Standard, null])),
	[QC.OName]:           Object.freeze(new AttributeDef(QC.OName,         ['Name Override', 'Common', AttributeType.String, null, '', '', 0, 0, '', '', '', ColumnNames.OName, ColumnFamilies.Standard, null])),
	[QC.UniformatClass] : Object.freeze(new AttributeDef(QC.UniformatClass,['Assembly Code', 'Common', AttributeType.String, null, '', '', 0, 0, '', '', '', ColumnNames.UniformatClass, ColumnFamilies.Standard, null])),
	[QC.OUniformatClass]: Object.freeze(new AttributeDef(QC.OUniformatClass, ['Assembly Code Override', 'Common', AttributeType.String, null, '', '', 0, 0, '', '', '', ColumnNames.OUniformatClass, ColumnFamilies.Standard, null])),
	[QC.Classification] : Object.freeze(new AttributeDef(QC.Classification,['Classification', 'Common', AttributeType.String, null, '', '', 0, 0, '', '', '', ColumnNames.Classification, ColumnFamilies.Standard, null])),
	[QC.OClassification]: Object.freeze(new AttributeDef(QC.OClassification, ['Classification Override', 'Common', AttributeType.String, null, '', '', 0, 0, '', '', '', ColumnNames.OClassification, ColumnFamilies.Standard, null])),
	[QC.Level] :          Object.freeze(new AttributeDef(QC.Level,         ['Level',  'Common', AttributeType.String, null, '', '', 0, 0, '', '', '', ColumnNames.Level, ColumnFamilies.Refs, null])),
	[QC.Rooms] :          Object.freeze(new AttributeDef(QC.Rooms,         ['Rooms',  'Common', AttributeType.String, null, '', '', 0, 0, '', '', '', ColumnNames.Rooms, ColumnFamilies.Refs, null])),
	[QC.CategoryId] :     Object.freeze(new AttributeDef(QC.CategoryId,    ['Category Id', 'Common', AttributeType.Integer, null, '', '', AttributeFlags.afReadOnly, 0, '', '', '', ColumnNames.CategoryId, ColumnFamilies.Standard, null])),
	[QC.CategoryName] :   Object.freeze(new AttributeDef(QC.CategoryName,  ['Category Name', 'Common', AttributeType.String, null, '', '', AttributeFlags.afReadOnly, 0, '', '', '', ColumnNames.CategoryName, ColumnFamilies.Virtual, null])),
	[QC.FamilyPath] :     Object.freeze(new AttributeDef(QC.FamilyPath,    ['Category/Family', 'Common', AttributeType.String, null, '', '', AttributeFlags.afHidden|AttributeFlags.afReadOnly, 0, '', '', '', ColumnNames.FamilyPath, ColumnFamilies.Standard, null])),

	[QC.Level]:           Object.freeze(new AttributeDef(QC.Level, ['Level', 'Common', AttributeType.String, null, '', '', 0, 0, '', '', '', ColumnNames.Level, ColumnFamilies.Refs, null])),
	[QC.OLevel]:          Object.freeze(new AttributeDef(QC.OLevel, ['Level Override', 'Common', AttributeType.String, null, '', '', 0, 0, '', '', '', ColumnNames.OLevel, ColumnFamilies.Refs, null])),
	[QC.Rooms]:           Object.freeze(new AttributeDef(QC.Rooms, ['Rooms', 'Common', AttributeType.DbKeyList, null, '', '', 0, 0, '', '', '', ColumnNames.Rooms, ColumnFamilies.Refs, null])),
	[QC.XRooms]:          Object.freeze(new AttributeDef(QC.XRooms, ['Rooms External', 'Common', AttributeType.ExDbKeyList, null, '', '', 0, 0, '', '', '', ColumnNames.Rooms, ColumnFamilies.Xrefs, null])),
	[QC.Parent]:          Object.freeze(new AttributeDef(QC.Parent, ['Parent', 'Common', AttributeType.DbKey, null, '', '', AttributeFlags.afReadOnly, 0, '', '', '', ColumnNames.Parent, ColumnFamilies.Refs, null])),
	[QC.FamilyType]:      Object.freeze(new AttributeDef(QC.FamilyType, ['Family Type', 'Common', AttributeType.DbKey, null, '', '', AttributeFlags.afReadOnly, 0, '', '', '', ColumnNames.FamilyType, ColumnFamilies.Refs, null])),
	[QC.SubFamily]:       Object.freeze(new AttributeDef(QC.SubFamily, ['SubFamily', 'Common', AttributeType.DbKey, null, '', '', AttributeFlags.afReadOnly, 0, '', '', '', ColumnNames.SubFamily, ColumnFamilies.Refs, null])),
};
export class AttrSchema {

	attrMap;
	hash2attr;
	dtAttrs;
	modelId;

	constructor(modelId, parsed) {
		this.modelId = modelId;
		this.parseAttributes(parsed);
	}

	parseAttributes(parsed) {

		let aMap = {};
		let hash2attr = {};
		let dtAttrs = [];
		let allAttrs = [];

		this.schemaVersion = parseInt(parsed[0].slice("pdb version dt ".length));

		//First item in the array is the schema version...
		for (let i=1; i<parsed.length; i+=2) {
			//Encoded attribute IDs do not have the column family prefix, because they all
			//belong to the Standard family
			//Here we add back the family prefix.
			//TODO: Do we want to change that on the database side?
			let attrIdInt = parsed[i];
			let attrSchema = parsed[i+1];
			let attr = new AttributeDef(attrIdInt, attrSchema);

			aMap[attrIdInt] = attr;
			hash2attr[attr.hash] = attr;
			allAttrs.push(attr);

			if (attr.isNative()) {
				const dtClass = attr.applicationFilter && attr.applicationFilter.dtClass;
				const userClass = attr.applicationFilter && attr.applicationFilter.userClass;
				if (dtClass) {
					attr.applicationFilter.dtClass = dtClass.map(s => s.replace(".", ""));
				}
				if (userClass) {
					attr.applicationFilter.userClass = userClass.map(s => s.replace(".", ""));
				}
				if (!dtClass && !userClass) {
					console.log("Unknown classification, parameter set will not be applied", attr);
				}
				dtAttrs.push(attr);
			}

			Object.freeze(attr);
		}

		//Add the fixed list of standard attributes
		for (let n in StandardAttributes) {
			let attr = StandardAttributes[n];

			//the standard attributes are defined with fully qualified names, we need
			//just the stripped column name in the attrMap to be consistent
			let [colFam, colName] = attr.id.split(":");
			aMap[colName || colFam] = attr;

			hash2attr[attr.hash] = attr;
			allAttrs.push(attr);
		}

		this.allAttrs = allAttrs;
		this.attrMap = aMap;
		this.hash2attr = hash2attr;
		this.dtAttrs = dtAttrs;
	}

	findAttribute(category, name) {

		for (let attr of this.allAttrs) {
			if (attr.name === name && attr.category === category) {
				return attr;
			}
		}

	}

	findAttributeById(id) {
		return this.attrMap[id];
	}
}