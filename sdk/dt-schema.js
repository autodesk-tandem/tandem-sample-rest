
const SchemaVersion = 1;

/**
 * Type-specific prefixes for rows in the Meta table
 */
const MetaTablePrefix = {
	Model : 0x00000000,
	User: 0x80000000,
};

/**
 * Type specific key prefix in the time series (log) table
 */
const LogTablePrefix = {
	DataMutation: 0x00000000
};

const ColumnFamilies = {

	Status:         "s",
	Attributes:     "p",
	AttributeHashes:"h",
	AccessControl:  "c",

	LMV:            "0",
	Standard:       "n",
	Refs:           "l",
	Xrefs:          "x",
	Source:         "r",
	DtProperties:   "z",
	Tags:           "t",

	UserInfo:       "u",
	ChangeInfo:     "c",

	Virtual:        "v"
};

const ColumnNames = {
	//LMV-isms
	Fragment:       "f", //family: LMV, data table
	BoundingBox:    "b", //family: LMV, data table
	LmvModelRoot:   "lmv", //family: LMV, data table
	AecModelData:   "aec", //family: LMV, data table

	DocumentId: "docid", //family: Standard, meta table, the GUID of the Revit document originally used to populate this model
	ForgeUrn:   "urn", //family: Standard, meta table, the URN of the source Derivative Service model used to populate our model
	Version:    "v", //family: Status. Schema version used for this Digital Twin,

	ElementFlags:       "a", //family: Standard
	UniformatClass:     "u", //family Standard, data table
	OUniformatClass:    "!u", //family Standard, data table, override
	Classification:     "v", //family Standard, data table (value) + family Status, meta table (scheme)
	OClassification:    "!v", //family Standard, data table, override
	Name:               "n", //family: Standard
	OName:              "!n", //family: Standard, name override
	SystemClass:        "b", //family: Standard, data table, Revit System Classification as bitmask
	OSystemClass:       "!b",//family: Standard, data table, Revit System Classification as bitmask, override
	CategoryId:         "c", //family: Standard
	CategoryName:       "vc", //family: Virtual
	FamilyPath:         "f", //family: Standard, Family Type elements only.

	Parent:     "p", //family: Refs
	FamilyType: "t", //family: Refs
	SubFamily:  "s", //family: Refs
	LmvDbId:    "d", //family: Refs
	Level:      "l", //family: Refs
	OLevel:     "!l", //family: Refs, override
	TopLevel:   "m", //family: Refs, data table
	Rooms:      "r", //family: Refs, data table
	Elements:   "e", //family: Xrefs, data table. Holds an information about which elements are linked to the current element
	Next:       "sn", //family: Links, data table. 's'ystem 'n'ext, List of downstream system ids
	Previous:   "sp", //family: Links, data table. 's'ystem 'p'rev, List of upstream system ids
	Unassigned: "su", //family: Links, data table. 's'ystem 'u'nassigned, List of non-directional system ids

	UserID:     "i", //family: UserInfo
	ClientID:   "c", //family: UserInfo
	UserName:   "n", //family: UserInfo
	ChangeType: "t", //family: ChangeInfo
	ChangeDesc: "d", //family: ChangeInfo
};

//Elements that have graphics have 0x00 in the highest byte (first byte in big endian)
//Elements that do not have graphics have something other than 0x00 in the highest byte
//Elements that are graphical children of a composite element (which owns the Assembly Code, etc) have nonzero third byte.
//TODO: The numbering scheme stil needs some rationalization
const ElementFlags = {

	//Physical elements key flags (they have geometry)
	SimpleElement:   0x00000000,
	NestedChild:     0x00000001, //Repeated/instanced or nested element (inside a host)
	NestedParent:    0x00000002, //Host Family, e.g. for Casework, Elevators, etc.

	CompositeChild:  0x00000003, //Curtain Wall element (system panel, mullion). Has geometry, but not counted as separate Assembly Code, etc
	CompositeParent: 0x00000004, //Curtain Wall parent element. Owns the system panels, mullions, etc. Has no geometry normally.
	Room:            0x00000005, //Room boundary. Has geometry, but is not part of the physical world

	//Logical elements (and in the future annotations)

	//Parents of physical elements that
	//do not have geometry
	FamilyType:      0x01000000,

	//Levels, etc logical Locations
	//NOTE: Rooms have geometry, so they
	//use 0x00 in the most significant byte
	Level:           0x01000001,

	//Holds the Revit document properties
	DocumentRoot:    0x01000002,

	// IoT data stream element - has no geometry
	Stream:          0x01000003,

	AllLogicalMask:  0xff000000,

	Unknown:         0xffffffff
};

const ChangeType = {
	ImportBegin: "import_begin",
	ImportEnd: "import_end",
	ImportFail: "import_fail"
};

//Primary key prefix flags. This is a subset/generalization
//of the detailed element flags, to aid narrowing down
//table scans when we need to list specific categories of elements.
//We should not get too specific here because it makes it harder to
//update elements just by their UniqueID
const KeyFlags = {
	Physical: 0x00000000, //Has geometry (or potentially has geometry), i.e. physically exists in the real world
	Logical:  0x01000000, //Level, Document, FamilyType, Group...
};

const QC = {
	Parent:             ColumnFamilies.Refs    + ":" + ColumnNames.Parent,
	SubFamily:          ColumnFamilies.Refs    + ":" + ColumnNames.SubFamily,
	FamilyType:         ColumnFamilies.Refs    + ":" + ColumnNames.FamilyType,
	Level:              ColumnFamilies.Refs    + ":" + ColumnNames.Level,
	OLevel:             ColumnFamilies.Refs    + ":" + ColumnNames.OLevel,
	Rooms:              ColumnFamilies.Refs    + ":" + ColumnNames.Rooms,
	XRooms:             ColumnFamilies.Xrefs   + ":" + ColumnNames.Rooms,
	XElements:          ColumnFamilies.Xrefs   + ":" + ColumnNames.Elements,
	Name:               ColumnFamilies.Standard + ":" + ColumnNames.Name,
	OName:              ColumnFamilies.Standard + ":" + ColumnNames.OName,
	CategoryId:         ColumnFamilies.Standard + ":" + ColumnNames.CategoryId,
	CategoryName:       ColumnFamilies.Virtual  + ":" + ColumnNames.CategoryName,
	ElementFlags:       ColumnFamilies.Standard + ":" + ColumnNames.ElementFlags,
	SystemClass:        ColumnFamilies.Standard + ":" + ColumnNames.SystemClass,
	OSystemClass:       ColumnFamilies.Standard + ":" + ColumnNames.OSystemClass,
	FamilyPath:         ColumnFamilies.Standard + ":" + ColumnNames.FamilyPath,
	UniformatClass:     ColumnFamilies.Standard + ":" + ColumnNames.UniformatClass,
	OUniformatClass:    ColumnFamilies.Standard + ":" + ColumnNames.OUniformatClass,
	Classification:     ColumnFamilies.Standard + ":" + ColumnNames.Classification,
	OClassification:    ColumnFamilies.Standard + ":" + ColumnNames.OClassification,
	LmvDbId:            ColumnFamilies.Refs    + ":" + ColumnNames.LmvDbId,
	SystemPrev:         ColumnFamilies.Refs    + ":" + ColumnNames.Previous,
	SystemNext:         ColumnFamilies.Refs    + ":" + ColumnNames.Next,
	SystemUnassigned:   ColumnFamilies.Refs    + ":" + ColumnNames.Unassigned,
	XSystemPrev:        ColumnFamilies.Xrefs   + ":" + ColumnNames.Previous,
	XSystemNext:        ColumnFamilies.Xrefs   + ":" + ColumnNames.Next,
	XSystemUnassigned:  ColumnFamilies.Xrefs   + ":" + ColumnNames.Unassigned,
	RowKey: "k"
};

const QCOverrides = {
	[QC.UniformatClass]: QC.OUniformatClass,
	[QC.Classification]: QC.OClassification,
	[QC.Level]: QC.OLevel,
	[QC.Name]: QC.OName,
};

export {
	MetaTablePrefix,
	ColumnFamilies,
	ColumnNames,
	ElementFlags,
	KeyFlags,
	SchemaVersion,
	ChangeType,
	LogTablePrefix,
	QC,
	QCOverrides
};
