var VALLOG = VALLOG || {};
VALLOG.data = VALLOG.data || {};
VALLOG.class = VALLOG.class || {};
VALLOG.function = VALLOG.function || {};

const data = VALLOG.data;
const cls = VALLOG.class;
const fun = VALLOG.function;

// 追跡値情報保持用（DB）
/** @type {Vallog[]} */
VALLOG.data.vals = [];
// 値追跡処理時に使用（一時的に追跡値に名前を付けて保持）
/** @type {Vallog[]} */
VALLOG.data.refs = [];

/** @type {string[]} */
VALLOG.data.dynamicCpStack = [];
/** @type {number[]} */
VALLOG.data.dynamicCpExpStack = [];
/** @type {number[]} */
VALLOG.data.dynamicCpBlockStack = [];
/** @type {{block: number,　excep: number, cp:number}[]} */
VALLOG.data.dynamicCpFunctionStack = [];
/** @type {{exp: number, block: number, fun: number, cp: number}[]} */
VALLOG.data.dynamicCpExceptionStack = [];

// 観察対象の経路
/** @type {{loc: LocationPair[], color: String}[]} */
VALLOG.data.watchList = [];

VALLOG.init = () => {
    data.vals = [];
    data.refs = [];
    data.dynamicCpStack = [];
    data.dynamicCpExpStack = [];
    data.dynamicCpBlockStack = [];
    data.dynamicCpFunctionStack = [];
    data.dynamicCpExceptionStack = [];
    data.watchList = [];
    cls.VallogId.init();
};

// Location型はすでにあり、@typedefでは上書きされない...
/**
 * @typedef MyLocation
 * @property {Number} line
 * @property {Number} ch */
VALLOG.class.Location = class {
    /** @type {Number} */
    #line = 0; // 1-indexed
    /** @type {Number} */
    #char = 0; // 0-indexed
    constructor(line, char) {
        this.#line = line;
        this.#char = char;
    }
    /** 1-indexed */
    get line() {
        return this.#line;
    }
    /** 0-indexed */
    get char() {
        return this.#char;
    }
};

/**
 * @typedef LocationPair
 * @property {MyLocation} start
 * @property {MyLocation} end
 */
VALLOG.class.LocationPair = class {
    /** @type {MyLocation} */
    #start;
    /** @type {MyLocation} */
    #end;
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

/**
 * @typedef VisitPosition
 * @property {LocationPair} locationPair
 * @property {String} name
 */
VALLOG.class.VisitPosition = class {
    /** @type {LocationPair} */
    #locationPair;
    /** @type {String} */
    #name;
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

/**
 * @typedef VallogId
 * @property {Number} id
 */
VALLOG.class.VallogId = class {
    static #__id = 0;
    /** @type {Number} */
    #id;
    constructor() {
        this.#id = cls.VallogId.#__id++;
    }
    get id() {
        return this.#id;
    }
    static init() {
        cls.VallogId.#__id = 0;
    }
};

/**
 * @typedef RelateInfo
 * @property {VallogId} id
 * @property {Number} time
 */
VALLOG.class.RelateInfo = class {
    /** @type {VallogId} */
    #relateValId;
    /** @type {Number} */
    #relateTime;
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

/**
 * @typedef Trace
 * @property {VisitPosition} position
 * @property {RelateInfo[]} relate
 * @property {string[]} checkPoint
 */
VALLOG.class.Trace = class {
    /** @type {VisitPosition} */
    #visitPosition;
    /** @type {RelateInfo[]} */
    #relateInfo;
    /** @type {string[]} */
    #checkPoint;
    constructor(position, info, cp) {
        this.#visitPosition = position;
        this.#relateInfo = info;
        this.#checkPoint = cp;
    }
    get position() {
        return this.#visitPosition;
    }
    get relate() {
        return this.#relateInfo;
    }
    get checkPoint() {
        return this.#checkPoint;
    }
};

/**
 * @typedef Vallog
 * @property {VallogId} id
 * @property {any} value
 * @property {Trace[]} traces
 */
VALLOG.class.Vallog = class {
    /** @type {VallogId} */
    #id = new cls.VallogId();
    /** @type {any} */
    #value;
    /** @type {Trace[]} */
    #traceInfo;
    // value: any
    constructor(value) {
        this.#value = value;
        this.#traceInfo = [];
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
    inspect(depth, opts) {
        return {id: this.id.id, value: this.value};
    }
};

VALLOG.function.makeTrace = (line1, char1, line2, char2, rels, name, cps, scpd) => {
    let locPair = new cls.LocationPair(
        new cls.Location(line1, char1),
        new cls.Location(line2, char2)
    );
    let relInfos = rels.map(vllg => new cls.RelateInfo(vllg.id, vllg.traces.length - 1));
    let visitPos = new cls.VisitPosition(locPair, name);
    let checkpoints = cps ?? [];
    checkpoints = [...checkpoints, ...data.dynamicCpExpStack];
    // cp_block_dynamic関連
    if (scpd !== undefined) {
        if (data.dynamicCpBlockStack.length != scpd) {
            // この場合，dynamicCpBlockStack.length > scpdとなっているはず...
            const popTimes = data.dynamicCpBlockStack.length - scpd;
            for (let i = 0; i < popTimes; ++i) {
                data.dynamicCpBlockStack.pop();
            }
        }
        checkpoints = [...checkpoints, ...data.dynamicCpBlockStack.flat()];
    }
    return new cls.Trace(visitPos, relInfos, checkpoints);
};

// obj: any
// line1, char1, line2, char2: number
// rels: Vallog[]
// key, name: string
// cps: string[]
VALLOG.function.pass = (obj, line1, char1, line2, char2, rels, key, name, cps, scpd) => {
    let tmp = obj;
    if (!(tmp instanceof cls.Vallog)) {
        tmp = new cls.Vallog(obj);
        data.vals.push(tmp);
    }
    data.refs[key] = tmp;
    // 前回と同じ場所、同じ関連する値、同じ変数名だった場合に追跡子情報を付与するorしない？
    tmp.traces.push(fun.makeTrace(line1, char1, line2, char2, rels, name, cps, scpd));
    return tmp;
};

VALLOG.function.getVal = (obj, line1, char1, line2, char2, rels, key, name, cps, scpd) => {
    let vllg = fun.pass(obj, line1, char1, line2, char2, rels, key, name, cps, scpd);
    return vllg.value;
};

// dynamicCp関連

VALLOG.function.dynamicCpPush = (cp) => {
    data.dynamicCpStack.push(cp);
};

VALLOG.function.dynamicCpExpStackSave = () => {
    data.dynamicCpExpStack.push(data.dynamicCpStack.length);
};

VALLOG.function.dynamicCpExpStackRestore = () => {
    let len = data.dynamicCpExpStack.pop();
    fun.restoreStack(data.dynamicCpStack, len);
};

VALLOG.function.dynamicCpBlockStackSave = () => {
    data.dynamicCpBlockStack.push(data.dynamicCpStack.length);
};

VALLOG.function.dynamicCpBlockStackRestore = () => {
    let len = data.dynamicCpBlockStack.pop();
    fun.restoreStack(data.dynamicCpStack, len);
};

VALLOG.function.dynamicCpFunctionStackSave = () => {
    data.dynamicCpFunctionStack.push({
        block: data.dynamicCpBlockStack.length,
        excep: data.dynamicCpExceptionStack.length,
        cp: data.dynamicCpStack.length
    });
};

VALLOG.function.dynamicCpFunctionStackRestore = () => {
    let item = data.dynamicCpFunctionStack.pop();
    fun.restoreStack(data.dynamicCpBlockStack, item.block);
    fun.restoreStack(data.dynamicCpExceptionStack, item.excep);
    fun.restoreStack(data.dynamicCpStack, item.cp);
};

VALLOG.function.dynamicCpExceptionStackSave = () => {
    data.dynamicCpExceptionStack.push({
        exp: data.dynamicCpExpStack.length,
        block: data.dynamicCpBlockStack.length,
        fun: data.dynamicCpFunctionStack.length,
        cp: data.dynamicCpStack.length
    });
};

VALLOG.function.dynamicCpExceptionStackRestore = () => {
    let item = data.dynamicCpExceptionStack.pop();
    fun.restoreStack(data.dynamicCpExpStack, item.exp);
    fun.restoreStack(data.dynamicCpBlockStack, item.block);
    fun.restoreStack(data.dynamicCpFunctionStack, item.fun);
    fun.restoreStack(data.dynamicCpStack, item.cp);
};

VALLOG.function.restoreStack = (st, len) => {
    if (st.length <= len) {
        return;
    }
    for (let i = 0; i < st.length - len; ++i) {
        st.pop();
    }
};