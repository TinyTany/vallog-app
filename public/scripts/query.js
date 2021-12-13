var QUERY = QUERY || {};
QUERY.data = QUERY.data || {};
QUERY.class = QUERY.class || {};

// 取得した値情報をすべて表示する（idと値の表記）
QUERY.valueList = () => {
    return VALLOG.data.vals.map(v => ({id: v.id.id, value: v.value}));
};

// コードエディタ上で選択された式を通過した値を検索
QUERY.findValue = () => {
    // 引数にする？orキャプチャで良い？（保留）
    const cm = myCodeMirror;

    // エディタ上の選択範囲を取得
    let from = cm.getCursor('from'); // {line(0-indexed), ch(0-indexed), ...}
    let to = cm.getCursor('to'); // {line(0-indexed), ch(0-indexed), ...}

    // 選択範囲の式を通過した値を検索
    let found = [];
    VALLOG.data.vals.forEach(v => {
        let res = v.traces.some(t => {
            let locp = t.position;
            let ls = locp.start;
            let le = locp.end;
            if (ls.line - 1 != from.line) {
                return false;
            }
            if (ls.char != from.ch) {
                return false;
            }
            if (le.line - 1 != to.line) {
                return false;
            }
            if (le.char != to.ch) {
                return false;
            }
            return true;
        });
        if (res) {
            found.push({id: v.id.id, value: v.value});
        }
    });

    return found;
};

// 値の「生成」に関与した値を検索
QUERY.findGen = (id) => {
    let vllg = VALLOG.data.vals[id];
    if (!vllg) {
        throw `Invalid id ${id}`;
    }
    return vllg.traces[0].relate.map(r => ({id: r.id.id, value: VALLOG.data.vals[r.id.id].value}));
}

// 値に関与した値を検索
QUERY.findRelate = (id) => {
    
};

/** @type {Log} */
QUERY.class.Log = class {
    /** @type {Vallog[]} */
    #log;
    constructor(log) {
        this.#log = log;
    }
    passCp(...cps) {
        let ans = [];
        this.#log.forEach(v => {
            if (v.traces.some(t => {
                return cps.every(cp => t.checkPoint.includes(cp));
            })) {
                ans.push(v);
            }
        });
        return new QUERY.class.Log(ans);
    }
    npassCp(...cps) {
        let ans = [];
        this.#log.forEach(v => {
            if (v.traces.every(t => {
                return !cps.every(cp => t.checkPoint.includes(cp));
            })) {
                ans.push(v);
            }
        });
        return new QUERY.class.Log(ans);
    }
    inspect(depth, ops) {
        return this.#log;
    }
    get length() {
        return this.#log.length;
    }
};