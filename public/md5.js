// MD5 einer Datei im Browser (RFC 1321). Backblaze B2 speichert fuer jede normal hochgeladene Datei
// ihren MD5-Wert (ETag). Damit laesst sich eine aufgetauchte Datei der Quelle im Portal zuordnen,
// ohne sie hochzuladen. Nicht fuer Sicherheitszwecke (Signaturen), nur zum Wiedererkennen.
(function (root) {
  'use strict';
  var S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  var K = new Int32Array(64);
  for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;

  function Md5() {
    this.h = new Int32Array([0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476]);
    this.buf = new Uint8Array(64);
    this.bufLen = 0;
    this.total = 0;
    this.w = new Int32Array(16);
  }
  Md5.prototype._block = function (b, o) {
    var w = this.w;
    for (var j = 0; j < 16; j++) w[j] = b[o + j * 4] | (b[o + j * 4 + 1] << 8) | (b[o + j * 4 + 2] << 16) | (b[o + j * 4 + 3] << 24);
    var a = this.h[0], bb = this.h[1], c = this.h[2], d = this.h[3];
    for (var i = 0; i < 64; i++) {
      var f, g;
      if (i < 16) { f = (bb & c) | (~bb & d); g = i; }
      else if (i < 32) { f = (d & bb) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = bb ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (bb | ~d); g = (7 * i) % 16; }
      var t = d;
      d = c;
      c = bb;
      var x = (a + f + K[i] + w[g]) | 0;
      bb = (bb + ((x << S[i]) | (x >>> (32 - S[i])))) | 0;
      a = t;
    }
    this.h[0] = (this.h[0] + a) | 0; this.h[1] = (this.h[1] + bb) | 0;
    this.h[2] = (this.h[2] + c) | 0; this.h[3] = (this.h[3] + d) | 0;
  };
  Md5.prototype.update = function (data) {
    var b = data instanceof Uint8Array ? data : new Uint8Array(data);
    var i = 0;
    this.total += b.length;
    if (this.bufLen) {
      while (this.bufLen < 64 && i < b.length) this.buf[this.bufLen++] = b[i++];
      if (this.bufLen === 64) { this._block(this.buf, 0); this.bufLen = 0; }
    }
    for (; i + 64 <= b.length; i += 64) this._block(b, i);
    while (i < b.length) this.buf[this.bufLen++] = b[i++];
    return this;
  };
  Md5.prototype.hex = function () {
    var bits = this.total * 8;
    var pad = new Uint8Array(((this.bufLen < 56 ? 56 : 120) - this.bufLen) + 8);
    pad[0] = 0x80;
    var lo = bits >>> 0, hi = Math.floor(bits / 4294967296) >>> 0;
    var p = pad.length - 8;
    for (var j = 0; j < 4; j++) { pad[p + j] = (lo >>> (8 * j)) & 255; pad[p + 4 + j] = (hi >>> (8 * j)) & 255; }
    var total = this.total;
    this.update(pad);
    this.total = total;
    var out = '';
    for (var k = 0; k < 4; k++) for (var n = 0; n < 4; n++) out += ((this.h[k] >>> (8 * n)) & 255).toString(16).padStart(2, '0');
    return out;
  };

  // Datei stueckweise lesen (auch grosse CAD-Dateien), onProgress(0..1)
  function md5File(file, onProgress) {
    var CHUNK = 4 * 1024 * 1024, m = new Md5(), pos = 0;
    return new Promise(function (resolve, reject) {
      function next() {
        if (pos >= file.size) { resolve(m.hex()); return; }
        file.slice(pos, pos + CHUNK).arrayBuffer().then(function (buf) {
          m.update(new Uint8Array(buf));
          pos += buf.byteLength;
          if (onProgress) onProgress(pos / file.size);
          setTimeout(next, 0);
        }, reject);
      }
      next();
    });
  }
  function md5Bytes(bytes) { return new Md5().update(bytes).hex(); }

  var api = { Md5: Md5, md5File: md5File, md5Bytes: md5Bytes };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MD5 = api;
})(this);
