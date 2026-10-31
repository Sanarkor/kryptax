// node testdata/tzprobe.js <dossier> — sonde lancée par test.js sous plusieurs fuseaux (TZ) : les résultats doivent être identiques
const E = require(process.argv[2] + '/engine.js');
const ts = E.fromParis(2025, 11, 31, 23, 30, 0), ts2 = E.fromParis(2026, 0, 1, 0, 30, 0), ts3 = E.fromParis(2025, 5, 10, 0, 15, 0);
const mk = () => [{ type: 'SELL', asset: 'AAA', date: ts, qty: 1 }, { type: 'SELL', asset: 'BBB', date: ts3, qty: 1 }];
const r1 = E.crossCheck(mk(), [{ asset: 'AAA', date: ts2, hasTime: false }, { asset: 'BBB', date: E.fromParis(2025, 5, 10, 12, 0, 0), hasTime: false }]);
const r2 = E.crossCheck(mk(), [{ asset: 'AAA', date: E.fromParis(2025, 11, 31, 1, 0, 0), hasTime: false }]);
console.log(JSON.stringify([r1.confirmed.length, r1.sellNoFiat.length, r2.confirmed.length, E.parisYear(ts), E.parisYear(ts2), E.fromParis(2026, 0, 1), E.parisDay(ts), E.parisDay(ts2)]));
