var VALLOG = VALLOG || {};
VALLOG.data = VALLOG.data || {};
VALLOG.class = VALLOG.class || {};
VALLOG.function = VALLOG.function || {};

const data = VALLOG.data;
const cls = VALLOG.class;
const fun = VALLOG.function;

// 追跡値情報保持用（DB）
VALLOG.data.vals = []; // [Vallog]
// 値追跡処理時に使用（一時的に追跡値に名前を付けて保持）
VALLOG.data.refs = []; // [Vallog]

VALLOG.class.Location = class {
    #line = 0; // Number
    #char = 0; // Number
    constructor(line, char) {
        this.#line = line;
        this.#char = char;
    }
    get line() {
        return this.#line;
    }
    get char() {
        return this.#char;
    }
};

VALLOG.class.LocationPair = class {
    #start; // Location
    #end; // Location
    constructor(start, end) {
        this.#start = start;
        this.#end = end;
    }
    get start() {
        return this.#start;
    }
    get end() {
        return this.#end;
    }
};

VALLOG.class.VisitPosition = class {
    #locationPair; // LocationPair
    #name; // string
    constructor(locationPair, name) {
        this.#locationPair = locationPair;
        this.#name = name;
    }
    get locationPair() {
        return this.#locationPair;
    }
    get name() {
        return this.#name;
    }
};

VALLOG.class.VallogId = class {
    static #__id = 0;
    #id;
    constructor() {
        this.#id = cls.VallogId.#__id++;
    }
    get id() {
        return this.#id;
    }
};

VALLOG.class.RelateInfo = class {
    #relateValId; // VallogId
    #relateTime; // Number (0-indexed)
    constructor(id, time) {
        this.#relateValId = id;
        this.#relateTime = time;
    }
    get id() {
        return this.#relateValId;
    }
    get time() {
        return this.#relateTime;
    }
};

VALLOG.class.Trace = class {
    #visitPosition; // VisitPosition
    #relateInfo; // [RelateInfo]
    constructor(position, info) {
        this.#visitPosition = position;
        this.#relateInfo = info;
    }
    get position() {
        return this.#visitPosition;
    }
    get relate() {
        return this.#relateInfo;
    }
};

VALLOG.class.Vallog = class {
    #id = new cls.VallogId(); // VallogId
    #value; // any
    #traceInfo = []; // [Trace]
    // value: any
    // line1, char1, line2, char2: number
    // rels: [Vallog]
    // name: string
    constructor(value, line1, char1, line2, char2, rels, name) {
        this.#value = value;
        this.#traceInfo.push(fun.makeTrace(line1, char1, line2, char2, rels, name));
    }
    get id() {
        return this.#id;
    }
    get value() {
        return this.#value;
    }
    get traces() {
        return this.#traceInfo;
    }
};

VALLOG.function.makeTrace = (line1, char1, line2, char2, rels, name) => {
    let locPair = new cls.LocationPair(
        new cls.Location(line1, char1),
        new cls.Location(line2, char2)
    );
    let relInfos = rels.map(vllg => new cls.RelateInfo(vllg.id, vllg.traces.length - 1));
    let visitPos = new cls.VisitPosition(locPair, name);
    return new cls.Trace(visitPos, relInfos);
};

// obj: any
// line1, char1, line2, char2: number
// rels: [Vallog]
// key, name: string
VALLOG.function.pass = (obj, line1, char1, line2, char2, rels, key, name) => {
    if (!(obj instanceof cls.Vallog)) {
        let vllg = new cls.Vallog(obj, line1, char1, line2, char2, rels, name);
        data.vals.push(vllg);
        data.refs[key] = vllg;
        return vllg;
    }
    data.refs[key] = obj;
    // 前回と同じ場所、同じ関連する値、同じ変数名だった場合に追跡子情報を付与するorしない？
    obj.traces.push(fun.makeTrace(line1, char1, line2, char2, rels, name));
    return obj;
};

VALLOG.function.getVal = (obj, line1, char1, line2, char2, rels, key, name) => {
    let vllg = fun.pass(obj, line1, char1, line2, char2, rels, key, name);
    return vllg.value;
};