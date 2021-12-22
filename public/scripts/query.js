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
QUERY.findGen = (...ids) => {
    const ans = [];
    ids.forEach(id => {
        const vllg = VALLOG.data.vals[id];
        if (!vllg) {
            return;
        }
        const gens = 
            vllg.traces[0].relate.map(r => ({id: r.id.id, value: VALLOG.data.vals[r.id.id].value}));
        const ansIds = ans.map(v => v.id);
        gens.forEach(gen => {
            if (!ansIds.includes(gen.id)) {
                ans.push(gen);
            }
        });
    });
    return ans;
}

QUERY.findGenAll = (id) => {
    let ans = [];
    const queue = [];
    let curId = id;
    do {
        let gens = QUERY.findGen(curId);
        let ansIds = ans.map(v => v.id);
        let confirmed = [];
        gens.forEach(g => {
            if (!ansIds.includes(g.id)) {
                confirmed.push(g);
            }
        });
        ans = [...ans, ...confirmed];
        confirmed.forEach(v => queue.push(v.id));
        curId = queue.shift();
    } while(queue.length > 0);
    return ans;
}

// 値に関与した値を検索
QUERY.findRelate = (id) => {
    throw 'findRelate: Not implemented yet';
};

QUERY.markerList = (...ids) => {
    let ans = [];
    ids.forEach(id => {
        const vllg = VALLOG.data.vals[id];
        if (!vllg) {
            return;
        }
        const mkrs = vllg.traces.map(t => t.markers).flat();
        mkrs.forEach(mkr => {
            if (!ans.includes(mkr)) {
                ans.push(mkr);
            }
        });
    });
    return ans;
}

/** @type {Log} */
QUERY.class.Log = class {
    /** @type {Vallog[]} */
    #log;
    constructor(log) {
        this.#log = log;
    }
    hasMkr(...mkrs) {
        let ans = [];
        this.#log.forEach(v => {
            if (v.traces.some(t => {
                return mkrs.every(mkr => t.markers.includes(mkr));
            })) {
                ans.push(v);
            }
        });
        return new QUERY.class.Log(ans);
    }
    nhasMkr(...mkrs) {
        let ans = [];
        this.#log.forEach(v => {
            if (v.traces.every(t => {
                return !mkrs.every(mkr => t.markers.includes(mkr));
            })) {
                ans.push(v);
            }
        });
        return new QUERY.class.Log(ans);
    }
    existMkrHst(mkrl, rel, mkrr) {
        const pred = QUERY.data.funEnv[rel];
        if (!pred) {
            return undefined;
        }
        let ans = [];
        this.#log.forEach(v => {
            if (v.traces.some(t => {
                return pred(t.markers, mkrl, mkrr);
            })) {
                ans.push(v);
            }
        });
        return new QUERY.class.Log(ans);
    }
    forallMkrHst(mkrl, rel, mkrr) {
        const pred = QUERY.data.funEnv[rel];
        if (!pred) {
            return undefined;
        }
        let ans = [];
        this.#log.forEach(v => {
            if (v.traces.every(t => {
                return pred(t.markers, mkrl, mkrr);
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

QUERY.data.funEnv = [];
{
    const env = QUERY.data.funEnv;
    env['DURING'] = (mkrs, lhs, rhs) => {
        return !mkrs.includes(lhs) || mkrs.includes(rhs);
    }
    env['NDURING'] = (mkrs, lhs, rhs) => {
        return !(env['DURING'](mkrs, lhs, rhs));
    }
    env['INTERSECT'] = (mkrs, lhs, rhs) => {
        return mkrs.includes(lhs) && mkrs.includes(rhs);
    }
    env['NINTERSECT'] = (mkrs, lhs, rhs) => {
        return !(env['INTERSECT'](mkrs, lhs, rhs));
    }
    env['SEPARATE'] = (mkrs, lhs, rhs) => {
        let or = mkrs.includes(lhs) || mkrs.includes(rhs);
        let and = mkrs.includes(lhs) && mkrs.includes(rhs);
        return or && !and;
    }
    env['NSEPARATE'] = (mkrs, lhs, rhs) => {
        return !(env['SEPARATE'](mkrs, lhs, rhs));
    }
}