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
/** @type {{loc: LocationPair[], color: string}[]} */
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
 * @property {number} line
 * @property {number} ch */
VALLOG.class.Location = class {
    /** @type {number} */
    #line = 0; // 1-indexed
    /** @type {number} */
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
 * @typedef VallogId
 * @property {number} id
 */
VALLOG.class.VallogId = class {
    static #__id = 0;
    /** @type {number} */
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
 * @property {number} id
 * @property {number} time
 */
VALLOG.class.RelateInfo = class {
    /** @type {VallogId} */
    #relateValId;
    /** @type {number} */
    #relateTime;
    constructor(id, time) {
        this.#relateValId = id;
        this.#relateTime = time;
    }
    get id() {
        return this.#relateValId.id;
    }
    get time() {
        return this.#relateTime;
    }
};

/**
 * @typedef Trace
 * @property {LocationPair} position
 * @property {RelateInfo[]} relate
 * @property {string[]} markers
 */
VALLOG.class.Trace = class {
    /** @type {LocationPair} */
    #position;
    /** @type {RelateInfo[]} */
    #relateInfo;
    /** @type {string[]} */
    #markers;
    constructor(position, info, mkrs) {
        this.#position = position;
        this.#relateInfo = info;
        this.#markers = mkrs;
    }
    get position() {
        return this.#position;
    }
    get relate() {
        return this.#relateInfo;
    }
    get markers() {
        return this.#markers;
    }
};

/**
 * @typedef Vallog
 * @property {number} id
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
        return this.#id.id;
    }
    get value() {
        return this.#value;
    }
    get traces() {
        return this.#traceInfo;
    }
    inspect(depth, opts) {
        return {id: this.id, value: this.value};
    }
};

VALLOG.function.makeTrace = (line1, char1, line2, char2, rels, cps) => {
    let locPair = new cls.LocationPair(
        new cls.Location(line1, char1),
        new cls.Location(line2, char2)
    );
    let relInfos = rels.map(vllg => new cls.RelateInfo(vllg.id, vllg.traces.length - 1));
    let markers = cps ?? [];
    markers = [...markers, ...data.dynamicCpStack];
    return new cls.Trace(locPair, relInfos, markers);
};

// obj: any
// line1, char1, line2, char2: number
// rels: Vallog[]
// key: string
// cps: string[]
VALLOG.function.pass = (obj, line1, char1, line2, char2, rels, key, cps) => {
    let tmp = obj;
    if (!(tmp instanceof cls.Vallog)) {
        tmp = new cls.Vallog(obj);
        data.vals.push(tmp);
    }
    data.refs[key] = tmp;
    // 前回と同じ場所、同じ関連する値、同じ変数名だった場合に追跡子情報を付与するorしない？
    tmp.traces.push(fun.makeTrace(line1, char1, line2, char2, rels, cps));
    return tmp;
};

VALLOG.function.getVal = (obj, line1, char1, line2, char2, rels, key, cps) => {
    let vllg = fun.pass(obj, line1, char1, line2, char2, rels, key, cps);
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