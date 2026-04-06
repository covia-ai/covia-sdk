import { Resolver } from 'did-resolver';
import { getResolver } from 'web-did-resolver';

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// node_modules/@noble/ed25519/index.js
var ed25519_CURVE, P, N, Gx, Gy, _a, _d, h, L, L2, err, isBig, isStr, isBytes, abytes, u8n, u8fr, padh, bytesToHex, C, _ch, hexToBytes, toU8, cr, subtle, concatBytes, randomBytes, big, arange, M, modN, invert, callHash, apoint, B256, _Point, Point, G, I, numTo32bLE, bytesToNumLE, pow2, pow_2_252_3, RM1, uvRatio, modL_LE, sha512a, sha512s, hash2extK, getExtendedPublicKeyAsync, getExtendedPublicKey, getPublicKey, hashFinishS, _sign, sign, etc, utils, W, scalarBits, pwindows, pwindowSize, precompute, Gpows, ctneg, wNAF;
var init_ed25519 = __esm({
  "node_modules/@noble/ed25519/index.js"() {
    ed25519_CURVE = {
      p: 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn,
      n: 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3edn,
      h: 8n,
      a: 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffecn,
      d: 0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3n,
      Gx: 0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51an,
      Gy: 0x6666666666666666666666666666666666666666666666666666666666666658n
    };
    ({ p: P, n: N, Gx, Gy, a: _a, d: _d } = ed25519_CURVE);
    h = 8n;
    L = 32;
    L2 = 64;
    err = (m = "") => {
      throw new Error(m);
    };
    isBig = (n) => typeof n === "bigint";
    isStr = (s) => typeof s === "string";
    isBytes = (a) => a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
    abytes = (a, l) => !isBytes(a) || typeof l === "number" && l > 0 && a.length !== l ? err("Uint8Array expected") : a;
    u8n = (len) => new Uint8Array(len);
    u8fr = (buf) => Uint8Array.from(buf);
    padh = (n, pad) => n.toString(16).padStart(pad, "0");
    bytesToHex = (b) => Array.from(abytes(b)).map((e) => padh(e, 2)).join("");
    C = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
    _ch = (ch) => {
      if (ch >= C._0 && ch <= C._9)
        return ch - C._0;
      if (ch >= C.A && ch <= C.F)
        return ch - (C.A - 10);
      if (ch >= C.a && ch <= C.f)
        return ch - (C.a - 10);
      return;
    };
    hexToBytes = (hex) => {
      const e = "hex invalid";
      if (!isStr(hex))
        return err(e);
      const hl = hex.length;
      const al = hl / 2;
      if (hl % 2)
        return err(e);
      const array = u8n(al);
      for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
        const n1 = _ch(hex.charCodeAt(hi));
        const n2 = _ch(hex.charCodeAt(hi + 1));
        if (n1 === void 0 || n2 === void 0)
          return err(e);
        array[ai] = n1 * 16 + n2;
      }
      return array;
    };
    toU8 = (a, len) => abytes(isStr(a) ? hexToBytes(a) : u8fr(abytes(a)), len);
    cr = () => globalThis?.crypto;
    subtle = () => cr()?.subtle ?? err("crypto.subtle must be defined");
    concatBytes = (...arrs) => {
      const r = u8n(arrs.reduce((sum, a) => sum + abytes(a).length, 0));
      let pad = 0;
      arrs.forEach((a) => {
        r.set(a, pad);
        pad += a.length;
      });
      return r;
    };
    randomBytes = (len = L) => {
      const c = cr();
      return c.getRandomValues(u8n(len));
    };
    big = BigInt;
    arange = (n, min, max, msg = "bad number: out of range") => isBig(n) && min <= n && n < max ? n : err(msg);
    M = (a, b = P) => {
      const r = a % b;
      return r >= 0n ? r : b + r;
    };
    modN = (a) => M(a, N);
    invert = (num, md) => {
      if (num === 0n || md <= 0n)
        err("no inverse n=" + num + " mod=" + md);
      let a = M(num, md), b = md, x = 0n, u = 1n;
      while (a !== 0n) {
        const q = b / a, r = b % a;
        const m = x - u * q;
        b = a, a = r, x = u, u = m;
      }
      return b === 1n ? M(x, md) : err("no inverse");
    };
    callHash = (name) => {
      const fn = etc[name];
      if (typeof fn !== "function")
        err("hashes." + name + " not set");
      return fn;
    };
    apoint = (p) => p instanceof Point ? p : err("Point expected");
    B256 = 2n ** 256n;
    _Point = class _Point {
      constructor(ex, ey, ez, et) {
        __publicField(this, "ex");
        __publicField(this, "ey");
        __publicField(this, "ez");
        __publicField(this, "et");
        const max = B256;
        this.ex = arange(ex, 0n, max);
        this.ey = arange(ey, 0n, max);
        this.ez = arange(ez, 1n, max);
        this.et = arange(et, 0n, max);
        Object.freeze(this);
      }
      static fromAffine(p) {
        return new _Point(p.x, p.y, 1n, M(p.x * p.y));
      }
      /** RFC8032 5.1.3: Uint8Array to Point. */
      static fromBytes(hex, zip215 = false) {
        const d = _d;
        const normed = u8fr(abytes(hex, L));
        const lastByte = hex[31];
        normed[31] = lastByte & -129;
        const y = bytesToNumLE(normed);
        const max = zip215 ? B256 : P;
        arange(y, 0n, max);
        const y2 = M(y * y);
        const u = M(y2 - 1n);
        const v = M(d * y2 + 1n);
        let { isValid, value: x } = uvRatio(u, v);
        if (!isValid)
          err("bad point: y not sqrt");
        const isXOdd = (x & 1n) === 1n;
        const isLastByteOdd = (lastByte & 128) !== 0;
        if (!zip215 && x === 0n && isLastByteOdd)
          err("bad point: x==0, isLastByteOdd");
        if (isLastByteOdd !== isXOdd)
          x = M(-x);
        return new _Point(x, y, 1n, M(x * y));
      }
      /** Checks if the point is valid and on-curve. */
      assertValidity() {
        const a = _a;
        const d = _d;
        const p = this;
        if (p.is0())
          throw new Error("bad point: ZERO");
        const { ex: X, ey: Y, ez: Z, et: T } = p;
        const X2 = M(X * X);
        const Y2 = M(Y * Y);
        const Z2 = M(Z * Z);
        const Z4 = M(Z2 * Z2);
        const aX2 = M(X2 * a);
        const left = M(Z2 * M(aX2 + Y2));
        const right = M(Z4 + M(d * M(X2 * Y2)));
        if (left !== right)
          throw new Error("bad point: equation left != right (1)");
        const XY = M(X * Y);
        const ZT = M(Z * T);
        if (XY !== ZT)
          throw new Error("bad point: equation left != right (2)");
        return this;
      }
      /** Equality check: compare points P&Q. */
      equals(other) {
        const { ex: X1, ey: Y1, ez: Z1 } = this;
        const { ex: X2, ey: Y2, ez: Z2 } = apoint(other);
        const X1Z2 = M(X1 * Z2);
        const X2Z1 = M(X2 * Z1);
        const Y1Z2 = M(Y1 * Z2);
        const Y2Z1 = M(Y2 * Z1);
        return X1Z2 === X2Z1 && Y1Z2 === Y2Z1;
      }
      is0() {
        return this.equals(I);
      }
      /** Flip point over y coordinate. */
      negate() {
        return new _Point(M(-this.ex), this.ey, this.ez, M(-this.et));
      }
      /** Point doubling. Complete formula. Cost: `4M + 4S + 1*a + 6add + 1*2`. */
      double() {
        const { ex: X1, ey: Y1, ez: Z1 } = this;
        const a = _a;
        const A = M(X1 * X1);
        const B = M(Y1 * Y1);
        const C2 = M(2n * M(Z1 * Z1));
        const D = M(a * A);
        const x1y1 = X1 + Y1;
        const E = M(M(x1y1 * x1y1) - A - B);
        const G2 = D + B;
        const F = G2 - C2;
        const H = D - B;
        const X3 = M(E * F);
        const Y3 = M(G2 * H);
        const T3 = M(E * H);
        const Z3 = M(F * G2);
        return new _Point(X3, Y3, Z3, T3);
      }
      /** Point addition. Complete formula. Cost: `8M + 1*k + 8add + 1*2`. */
      add(other) {
        const { ex: X1, ey: Y1, ez: Z1, et: T1 } = this;
        const { ex: X2, ey: Y2, ez: Z2, et: T2 } = apoint(other);
        const a = _a;
        const d = _d;
        const A = M(X1 * X2);
        const B = M(Y1 * Y2);
        const C2 = M(T1 * d * T2);
        const D = M(Z1 * Z2);
        const E = M((X1 + Y1) * (X2 + Y2) - A - B);
        const F = M(D - C2);
        const G2 = M(D + C2);
        const H = M(B - a * A);
        const X3 = M(E * F);
        const Y3 = M(G2 * H);
        const T3 = M(E * H);
        const Z3 = M(F * G2);
        return new _Point(X3, Y3, Z3, T3);
      }
      /**
       * Point-by-scalar multiplication. Scalar must be in range 1 <= n < CURVE.n.
       * Uses {@link wNAF} for base point.
       * Uses fake point to mitigate side-channel leakage.
       * @param n scalar by which point is multiplied
       * @param safe safe mode guards against timing attacks; unsafe mode is faster
       */
      multiply(n, safe = true) {
        if (!safe && (n === 0n || this.is0()))
          return I;
        arange(n, 1n, N);
        if (n === 1n)
          return this;
        if (this.equals(G))
          return wNAF(n).p;
        let p = I;
        let f = G;
        for (let d = this; n > 0n; d = d.double(), n >>= 1n) {
          if (n & 1n)
            p = p.add(d);
          else if (safe)
            f = f.add(d);
        }
        return p;
      }
      /** Convert point to 2d xy affine point. (X, Y, Z) ∋ (x=X/Z, y=Y/Z) */
      toAffine() {
        const { ex: x, ey: y, ez: z } = this;
        if (this.equals(I))
          return { x: 0n, y: 1n };
        const iz = invert(z, P);
        if (M(z * iz) !== 1n)
          err("invalid inverse");
        return { x: M(x * iz), y: M(y * iz) };
      }
      toBytes() {
        const { x, y } = this.assertValidity().toAffine();
        const b = numTo32bLE(y);
        b[31] |= x & 1n ? 128 : 0;
        return b;
      }
      toHex() {
        return bytesToHex(this.toBytes());
      }
      // encode to hex string
      clearCofactor() {
        return this.multiply(big(h), false);
      }
      isSmallOrder() {
        return this.clearCofactor().is0();
      }
      isTorsionFree() {
        let p = this.multiply(N / 2n, false).double();
        if (N % 2n)
          p = p.add(this);
        return p.is0();
      }
      static fromHex(hex, zip215) {
        return _Point.fromBytes(toU8(hex), zip215);
      }
      get x() {
        return this.toAffine().x;
      }
      get y() {
        return this.toAffine().y;
      }
      toRawBytes() {
        return this.toBytes();
      }
    };
    __publicField(_Point, "BASE");
    __publicField(_Point, "ZERO");
    Point = _Point;
    G = new Point(Gx, Gy, 1n, M(Gx * Gy));
    I = new Point(0n, 1n, 1n, 0n);
    Point.BASE = G;
    Point.ZERO = I;
    numTo32bLE = (num) => hexToBytes(padh(arange(num, 0n, B256), L2)).reverse();
    bytesToNumLE = (b) => big("0x" + bytesToHex(u8fr(abytes(b)).reverse()));
    pow2 = (x, power) => {
      let r = x;
      while (power-- > 0n) {
        r *= r;
        r %= P;
      }
      return r;
    };
    pow_2_252_3 = (x) => {
      const x2 = x * x % P;
      const b2 = x2 * x % P;
      const b4 = pow2(b2, 2n) * b2 % P;
      const b5 = pow2(b4, 1n) * x % P;
      const b10 = pow2(b5, 5n) * b5 % P;
      const b20 = pow2(b10, 10n) * b10 % P;
      const b40 = pow2(b20, 20n) * b20 % P;
      const b80 = pow2(b40, 40n) * b40 % P;
      const b160 = pow2(b80, 80n) * b80 % P;
      const b240 = pow2(b160, 80n) * b80 % P;
      const b250 = pow2(b240, 10n) * b10 % P;
      const pow_p_5_8 = pow2(b250, 2n) * x % P;
      return { pow_p_5_8, b2 };
    };
    RM1 = 0x2b8324804fc1df0b2b4d00993dfbd7a72f431806ad2fe478c4ee1b274a0ea0b0n;
    uvRatio = (u, v) => {
      const v3 = M(v * v * v);
      const v7 = M(v3 * v3 * v);
      const pow = pow_2_252_3(u * v7).pow_p_5_8;
      let x = M(u * v3 * pow);
      const vx2 = M(v * x * x);
      const root1 = x;
      const root2 = M(x * RM1);
      const useRoot1 = vx2 === u;
      const useRoot2 = vx2 === M(-u);
      const noRoot = vx2 === M(-u * RM1);
      if (useRoot1)
        x = root1;
      if (useRoot2 || noRoot)
        x = root2;
      if ((M(x) & 1n) === 1n)
        x = M(-x);
      return { isValid: useRoot1 || useRoot2, value: x };
    };
    modL_LE = (hash) => modN(bytesToNumLE(hash));
    sha512a = (...m) => etc.sha512Async(...m);
    sha512s = (...m) => callHash("sha512Sync")(...m);
    hash2extK = (hashed) => {
      const head = hashed.slice(0, L);
      head[0] &= 248;
      head[31] &= 127;
      head[31] |= 64;
      const prefix = hashed.slice(L, L2);
      const scalar = modL_LE(head);
      const point = G.multiply(scalar);
      const pointBytes = point.toBytes();
      return { head, prefix, scalar, point, pointBytes };
    };
    getExtendedPublicKeyAsync = (priv) => sha512a(toU8(priv, L)).then(hash2extK);
    getExtendedPublicKey = (priv) => hash2extK(sha512s(toU8(priv, L)));
    getPublicKey = (priv) => getExtendedPublicKey(priv).pointBytes;
    hashFinishS = (res) => res.finish(sha512s(res.hashable));
    _sign = (e, rBytes, msg) => {
      const { pointBytes: P2, scalar: s } = e;
      const r = modL_LE(rBytes);
      const R = G.multiply(r).toBytes();
      const hashable = concatBytes(R, P2, msg);
      const finish = (hashed) => {
        const S = modN(r + modL_LE(hashed) * s);
        return abytes(concatBytes(R, numTo32bLE(S)), L2);
      };
      return { hashable, finish };
    };
    sign = (msg, privKey) => {
      const m = toU8(msg);
      const e = getExtendedPublicKey(privKey);
      const rBytes = sha512s(e.prefix, m);
      return hashFinishS(_sign(e, rBytes, m));
    };
    etc = {
      sha512Async: async (...messages) => {
        const s = subtle();
        const m = concatBytes(...messages);
        return u8n(await s.digest("SHA-512", m.buffer));
      },
      sha512Sync: void 0,
      bytesToHex,
      hexToBytes,
      concatBytes,
      mod: M,
      invert,
      randomBytes
    };
    utils = {
      getExtendedPublicKeyAsync,
      getExtendedPublicKey,
      randomPrivateKey: () => randomBytes(L),
      precompute: (w = 8, p = G) => {
        p.multiply(3n);
        return p;
      }
      // no-op
    };
    W = 8;
    scalarBits = 256;
    pwindows = Math.ceil(scalarBits / W) + 1;
    pwindowSize = 2 ** (W - 1);
    precompute = () => {
      const points = [];
      let p = G;
      let b = p;
      for (let w = 0; w < pwindows; w++) {
        b = p;
        points.push(b);
        for (let i = 1; i < pwindowSize; i++) {
          b = b.add(p);
          points.push(b);
        }
        p = b.double();
      }
      return points;
    };
    Gpows = void 0;
    ctneg = (cnd, p) => {
      const n = p.negate();
      return cnd ? n : p;
    };
    wNAF = (n) => {
      const comp = Gpows || (Gpows = precompute());
      let p = I;
      let f = G;
      const pow_2_w = 2 ** W;
      const maxNum = pow_2_w;
      const mask = big(pow_2_w - 1);
      const shiftBy = big(W);
      for (let w = 0; w < pwindows; w++) {
        let wbits = Number(n & mask);
        n >>= shiftBy;
        if (wbits > pwindowSize) {
          wbits -= maxNum;
          n += 1n;
        }
        const off = w * pwindowSize;
        const offF = off;
        const offP = off + Math.abs(wbits) - 1;
        const isEven = w % 2 !== 0;
        const isNeg = wbits < 0;
        if (wbits === 0) {
          f = f.add(ctneg(isEven, comp[offF]));
        } else {
          p = p.add(ctneg(isNeg, comp[offP]));
        }
      }
      return { p, f };
    };
  }
});

// node_modules/@noble/hashes/esm/utils.js
function isBytes2(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes2(b, ...lengths) {
  if (!isBytes2(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes2(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes2(data);
  return data;
}
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
var Hash;
var init_utils = __esm({
  "node_modules/@noble/hashes/esm/utils.js"() {
    Hash = class {
    };
  }
});

// node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n2 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n2 & _u32_max);
  const wl = Number(value & _u32_max);
  const h2 = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h2, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
var HashMD, SHA512_IV;
var init_md = __esm({
  "node_modules/@noble/hashes/esm/_md.js"() {
    init_utils();
    HashMD = class extends Hash {
      constructor(blockLen, outputLen, padOffset, isLE) {
        super();
        this.finished = false;
        this.length = 0;
        this.pos = 0;
        this.destroyed = false;
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView(this.buffer);
      }
      update(data) {
        aexists(this);
        data = toBytes(data);
        abytes2(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            const dataView = createView(data);
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(dataView, pos);
            continue;
          }
          buffer.set(data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(view, 0);
            this.pos = 0;
          }
        }
        this.length += data.length;
        this.roundClean();
        return this;
      }
      digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        const { buffer, view, blockLen, isLE } = this;
        let { pos } = this;
        buffer[pos++] = 128;
        clean(this.buffer.subarray(pos));
        if (this.padOffset > blockLen - pos) {
          this.process(view, 0);
          pos = 0;
        }
        for (let i = pos; i < blockLen; i++)
          buffer[i] = 0;
        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
        this.process(view, 0);
        const oview = createView(out);
        const len = this.outputLen;
        if (len % 4)
          throw new Error("_sha2: outputLen should be aligned to 32bit");
        const outLen = len / 4;
        const state = this.get();
        if (outLen > state.length)
          throw new Error("_sha2: outputLen bigger than state");
        for (let i = 0; i < outLen; i++)
          oview.setUint32(4 * i, state[i], isLE);
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneInto(to) {
        to || (to = new this.constructor());
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (length % blockLen)
          to.buffer.set(buffer);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
    };
    SHA512_IV = /* @__PURE__ */ Uint32Array.from([
      1779033703,
      4089235720,
      3144134277,
      2227873595,
      1013904242,
      4271175723,
      2773480762,
      1595750129,
      1359893119,
      2917565137,
      2600822924,
      725511199,
      528734635,
      4215389547,
      1541459225,
      327033209
    ]);
  }
});

// node_modules/@noble/hashes/esm/_u64.js
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h: h2, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h2, l];
  }
  return [Ah, Al];
}
function add(Ah, Al, Bh, Bl) {
  const l = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
}
var U32_MASK64, _32n, shrSH, shrSL, rotrSH, rotrSL, rotrBH, rotrBL, add3L, add3H, add4L, add4H, add5L, add5H;
var init_u64 = __esm({
  "node_modules/@noble/hashes/esm/_u64.js"() {
    U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
    _32n = /* @__PURE__ */ BigInt(32);
    shrSH = (h2, _l, s) => h2 >>> s;
    shrSL = (h2, l, s) => h2 << 32 - s | l >>> s;
    rotrSH = (h2, l, s) => h2 >>> s | l << 32 - s;
    rotrSL = (h2, l, s) => h2 << 32 - s | l >>> s;
    rotrBH = (h2, l, s) => h2 << 64 - s | l >>> s - 32;
    rotrBL = (h2, l, s) => h2 >>> s - 32 | l << 64 - s;
    add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
    add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
    add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
    add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
    add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
    add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;
  }
});

// node_modules/@noble/hashes/esm/sha2.js
var K512, SHA512_Kh, SHA512_Kl, SHA512_W_H, SHA512_W_L, SHA512, sha512;
var init_sha2 = __esm({
  "node_modules/@noble/hashes/esm/sha2.js"() {
    init_md();
    init_u64();
    init_utils();
    K512 = /* @__PURE__ */ (() => split([
      "0x428a2f98d728ae22",
      "0x7137449123ef65cd",
      "0xb5c0fbcfec4d3b2f",
      "0xe9b5dba58189dbbc",
      "0x3956c25bf348b538",
      "0x59f111f1b605d019",
      "0x923f82a4af194f9b",
      "0xab1c5ed5da6d8118",
      "0xd807aa98a3030242",
      "0x12835b0145706fbe",
      "0x243185be4ee4b28c",
      "0x550c7dc3d5ffb4e2",
      "0x72be5d74f27b896f",
      "0x80deb1fe3b1696b1",
      "0x9bdc06a725c71235",
      "0xc19bf174cf692694",
      "0xe49b69c19ef14ad2",
      "0xefbe4786384f25e3",
      "0x0fc19dc68b8cd5b5",
      "0x240ca1cc77ac9c65",
      "0x2de92c6f592b0275",
      "0x4a7484aa6ea6e483",
      "0x5cb0a9dcbd41fbd4",
      "0x76f988da831153b5",
      "0x983e5152ee66dfab",
      "0xa831c66d2db43210",
      "0xb00327c898fb213f",
      "0xbf597fc7beef0ee4",
      "0xc6e00bf33da88fc2",
      "0xd5a79147930aa725",
      "0x06ca6351e003826f",
      "0x142929670a0e6e70",
      "0x27b70a8546d22ffc",
      "0x2e1b21385c26c926",
      "0x4d2c6dfc5ac42aed",
      "0x53380d139d95b3df",
      "0x650a73548baf63de",
      "0x766a0abb3c77b2a8",
      "0x81c2c92e47edaee6",
      "0x92722c851482353b",
      "0xa2bfe8a14cf10364",
      "0xa81a664bbc423001",
      "0xc24b8b70d0f89791",
      "0xc76c51a30654be30",
      "0xd192e819d6ef5218",
      "0xd69906245565a910",
      "0xf40e35855771202a",
      "0x106aa07032bbd1b8",
      "0x19a4c116b8d2d0c8",
      "0x1e376c085141ab53",
      "0x2748774cdf8eeb99",
      "0x34b0bcb5e19b48a8",
      "0x391c0cb3c5c95a63",
      "0x4ed8aa4ae3418acb",
      "0x5b9cca4f7763e373",
      "0x682e6ff3d6b2b8a3",
      "0x748f82ee5defb2fc",
      "0x78a5636f43172f60",
      "0x84c87814a1f0ab72",
      "0x8cc702081a6439ec",
      "0x90befffa23631e28",
      "0xa4506cebde82bde9",
      "0xbef9a3f7b2c67915",
      "0xc67178f2e372532b",
      "0xca273eceea26619c",
      "0xd186b8c721c0c207",
      "0xeada7dd6cde0eb1e",
      "0xf57d4f7fee6ed178",
      "0x06f067aa72176fba",
      "0x0a637dc5a2c898a6",
      "0x113f9804bef90dae",
      "0x1b710b35131c471b",
      "0x28db77f523047d84",
      "0x32caab7b40c72493",
      "0x3c9ebe0a15c9bebc",
      "0x431d67c49c100d4c",
      "0x4cc5d4becb3e42b6",
      "0x597f299cfc657e2a",
      "0x5fcb6fab3ad6faec",
      "0x6c44198c4a475817"
    ].map((n) => BigInt(n))))();
    SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
    SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
    SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
    SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
    SHA512 = class extends HashMD {
      constructor(outputLen = 64) {
        super(128, outputLen, 16, false);
        this.Ah = SHA512_IV[0] | 0;
        this.Al = SHA512_IV[1] | 0;
        this.Bh = SHA512_IV[2] | 0;
        this.Bl = SHA512_IV[3] | 0;
        this.Ch = SHA512_IV[4] | 0;
        this.Cl = SHA512_IV[5] | 0;
        this.Dh = SHA512_IV[6] | 0;
        this.Dl = SHA512_IV[7] | 0;
        this.Eh = SHA512_IV[8] | 0;
        this.El = SHA512_IV[9] | 0;
        this.Fh = SHA512_IV[10] | 0;
        this.Fl = SHA512_IV[11] | 0;
        this.Gh = SHA512_IV[12] | 0;
        this.Gl = SHA512_IV[13] | 0;
        this.Hh = SHA512_IV[14] | 0;
        this.Hl = SHA512_IV[15] | 0;
      }
      // prettier-ignore
      get() {
        const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
      }
      // prettier-ignore
      set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
        this.Ah = Ah | 0;
        this.Al = Al | 0;
        this.Bh = Bh | 0;
        this.Bl = Bl | 0;
        this.Ch = Ch | 0;
        this.Cl = Cl | 0;
        this.Dh = Dh | 0;
        this.Dl = Dl | 0;
        this.Eh = Eh | 0;
        this.El = El | 0;
        this.Fh = Fh | 0;
        this.Fl = Fl | 0;
        this.Gh = Gh | 0;
        this.Gl = Gl | 0;
        this.Hh = Hh | 0;
        this.Hl = Hl | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4) {
          SHA512_W_H[i] = view.getUint32(offset);
          SHA512_W_L[i] = view.getUint32(offset += 4);
        }
        for (let i = 16; i < 80; i++) {
          const W15h = SHA512_W_H[i - 15] | 0;
          const W15l = SHA512_W_L[i - 15] | 0;
          const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
          const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
          const W2h = SHA512_W_H[i - 2] | 0;
          const W2l = SHA512_W_L[i - 2] | 0;
          const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
          const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
          const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
          const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
          SHA512_W_H[i] = SUMh | 0;
          SHA512_W_L[i] = SUMl | 0;
        }
        let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        for (let i = 0; i < 80; i++) {
          const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
          const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
          const CHIh = Eh & Fh ^ ~Eh & Gh;
          const CHIl = El & Fl ^ ~El & Gl;
          const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
          const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
          const T1l = T1ll | 0;
          const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
          const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
          const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
          const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
          Hh = Gh | 0;
          Hl = Gl | 0;
          Gh = Fh | 0;
          Gl = Fl | 0;
          Fh = Eh | 0;
          Fl = El | 0;
          ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
          Dh = Ch | 0;
          Dl = Cl | 0;
          Ch = Bh | 0;
          Cl = Bl | 0;
          Bh = Ah | 0;
          Bl = Al | 0;
          const All = add3L(T1l, sigma0l, MAJl);
          Ah = add3H(All, T1h, sigma0h, MAJh);
          Al = All | 0;
        }
        ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
        ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
        ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
        ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
        ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
        ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
        ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
        ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
        this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
      }
      roundClean() {
        clean(SHA512_W_H, SHA512_W_L);
      }
      destroy() {
        clean(this.buffer);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
    };
    sha512 = /* @__PURE__ */ createHasher(() => new SHA512());
  }
});

// node_modules/@noble/hashes/esm/sha512.js
var sha5122;
var init_sha512 = __esm({
  "node_modules/@noble/hashes/esm/sha512.js"() {
    init_sha2();
    sha5122 = sha512;
  }
});

// src/crypto/keys.ts
var keys_exports = {};
__export(keys_exports, {
  generateKeyPair: () => generateKeyPair,
  getPublicKey: () => getPublicKey2,
  hexToPrivateKey: () => hexToPrivateKey,
  privateKeyToHex: () => privateKeyToHex
});
function generateKeyPair() {
  const privateKey = utils.randomPrivateKey();
  const publicKey = getPublicKey(privateKey);
  return { privateKey, publicKey };
}
function getPublicKey2(privateKey) {
  return getPublicKey(privateKey);
}
function privateKeyToHex(key) {
  return Array.from(key).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToPrivateKey(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
var init_keys = __esm({
  "src/crypto/keys.ts"() {
    init_ed25519();
    init_sha512();
    etc.sha512Sync = (...m) => {
      const h2 = sha5122.create();
      for (const msg of m) h2.update(msg);
      return h2.digest();
    };
  }
});

// src/crypto/base58.ts
function encode(bytes) {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % BASE;
      carry = carry / BASE | 0;
    }
    while (carry > 0) {
      digits.push(carry % BASE);
      carry = carry / BASE | 0;
    }
  }
  let result = ALPHABET[0].repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    result += ALPHABET[digits[i]];
  }
  return result;
}
function decode(str) {
  if (str.length === 0) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < str.length && str[zeros] === ALPHABET[0]) zeros++;
  const bytes = [];
  for (let i = zeros; i < str.length; i++) {
    const val = ALPHABET_MAP.get(str[i]);
    if (val === void 0) throw new Error(`Invalid base58 character: ${str[i]}`);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * BASE;
      bytes[j] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  const result = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < zeros; i++) result[i] = 0;
  for (let i = 0; i < bytes.length; i++) result[zeros + i] = bytes[bytes.length - 1 - i];
  return result;
}
var ALPHABET, BASE, ALPHABET_MAP;
var init_base58 = __esm({
  "src/crypto/base58.ts"() {
    ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    BASE = 58;
    ALPHABET_MAP = /* @__PURE__ */ new Map();
    for (let i = 0; i < ALPHABET.length; i++) {
      ALPHABET_MAP.set(ALPHABET[i], i);
    }
  }
});

// src/crypto/multikey.ts
var multikey_exports = {};
__export(multikey_exports, {
  decodePublicKey: () => decodePublicKey,
  didFromPublicKey: () => didFromPublicKey,
  encodePublicKey: () => encodePublicKey
});
function encodePublicKey(publicKey) {
  const prefixed = new Uint8Array(2 + publicKey.length);
  prefixed.set(ED25519_PREFIX, 0);
  prefixed.set(publicKey, 2);
  return "z" + encode(prefixed);
}
function decodePublicKey(multikey) {
  if (!multikey.startsWith("z")) {
    throw new Error('Multikey must start with "z"');
  }
  const decoded = decode(multikey.slice(1));
  if (decoded[0] !== 237 || decoded[1] !== 1) {
    throw new Error("Invalid Ed25519 multikey prefix");
  }
  return decoded.slice(2);
}
function didFromPublicKey(publicKey) {
  return `did:key:${encodePublicKey(publicKey)}`;
}
var ED25519_PREFIX;
var init_multikey = __esm({
  "src/crypto/multikey.ts"() {
    init_base58();
    ED25519_PREFIX = new Uint8Array([237, 1]);
  }
});

// src/crypto/jwt.ts
var jwt_exports = {};
__export(jwt_exports, {
  base64UrlEncode: () => base64UrlEncode,
  createEdDSAJWT: () => createEdDSAJWT
});
function base64UrlEncode(data) {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function createEdDSAJWT(privateKey, lifetimeSeconds = 300) {
  const publicKey = getPublicKey2(privateKey);
  const multikey = encodePublicKey(publicKey);
  const did = `did:key:${multikey}`;
  const nowSecs = Math.floor(Date.now() / 1e3);
  const header = JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: multikey });
  const payload = JSON.stringify({
    sub: did,
    iss: did,
    iat: nowSecs,
    exp: nowSecs + lifetimeSeconds
  });
  const headerB64 = base64UrlEncode(encoder.encode(header));
  const payloadB64 = base64UrlEncode(encoder.encode(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = sign(encoder.encode(signingInput), privateKey);
  const signatureB64 = base64UrlEncode(signature);
  return `${signingInput}.${signatureB64}`;
}
var encoder;
var init_jwt = __esm({
  "src/crypto/jwt.ts"() {
    init_ed25519();
    init_multikey();
    init_keys();
    encoder = new TextEncoder();
  }
});

// src/types.ts
var RunStatus = /* @__PURE__ */ ((RunStatus2) => {
  RunStatus2["COMPLETE"] = "COMPLETE";
  RunStatus2["FAILED"] = "FAILED";
  RunStatus2["PENDING"] = "PENDING";
  RunStatus2["STARTED"] = "STARTED";
  RunStatus2["CANCELLED"] = "CANCELLED";
  RunStatus2["TIMEOUT"] = "TIMEOUT";
  RunStatus2["REJECTED"] = "REJECTED";
  RunStatus2["INPUT_REQUIRED"] = "INPUT_REQUIRED";
  RunStatus2["AUTH_REQUIRED"] = "AUTH_REQUIRED";
  RunStatus2["PAUSED"] = "PAUSED";
  return RunStatus2;
})(RunStatus || {});
var JobStatus = RunStatus;
var AgentStatus = /* @__PURE__ */ ((AgentStatus2) => {
  AgentStatus2["SLEEPING"] = "SLEEPING";
  AgentStatus2["RUNNING"] = "RUNNING";
  AgentStatus2["SUSPENDED"] = "SUSPENDED";
  AgentStatus2["TERMINATED"] = "TERMINATED";
  return AgentStatus2;
})(AgentStatus || {});
var CoviaError = class extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = "CoviaError";
    this.code = code;
    this.message = message;
  }
};
var GridError = class extends CoviaError {
  constructor(statusCode, message, responseBody = null) {
    super(`HTTP ${statusCode}: ${message}`, statusCode);
    this.name = "GridError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
};
var CoviaConnectionError = class extends CoviaError {
  constructor(message) {
    super(message);
    this.name = "CoviaConnectionError";
  }
};
var CoviaTimeoutError = class extends CoviaError {
  constructor(message) {
    super(message);
    this.name = "CoviaTimeoutError";
  }
};
var JobFailedError = class extends CoviaError {
  constructor(jobData) {
    const id = jobData.id ?? "unknown";
    const status = jobData.status ?? "unknown";
    let msg = `Job ${id} ${status}`;
    if (jobData.output?.error) {
      msg += `: ${jobData.output.error}`;
    }
    super(msg);
    this.name = "JobFailedError";
    this.jobData = jobData;
  }
};
var NotFoundError = class extends GridError {
  constructor(message) {
    super(404, message);
    this.name = "NotFoundError";
  }
};
var AssetNotFoundError = class extends NotFoundError {
  constructor(assetId) {
    super(`Asset not found: ${assetId}`);
    this.name = "AssetNotFoundError";
    this.assetId = assetId;
  }
};
var JobNotFoundError = class extends NotFoundError {
  constructor(jobId) {
    super(`Job not found: ${jobId}`);
    this.name = "JobNotFoundError";
    this.jobId = jobId;
  }
};

// src/Credentials.ts
var Auth = class {
};
var NoAuth = class extends Auth {
  apply(_headers) {
  }
};
var BearerAuth = class extends Auth {
  constructor(token) {
    super();
    this._token = token;
  }
  apply(headers) {
    headers["Authorization"] = `Bearer ${this._token}`;
  }
};
var KeyPairAuth = class _KeyPairAuth extends Auth {
  /**
   * @param privateKey - 32-byte Ed25519 private key
   * @param tokenLifetimeSeconds - JWT lifetime in seconds (default 300 = 5 min)
   */
  constructor(privateKey, tokenLifetimeSeconds = 300) {
    super();
    const { getPublicKey: getPublicKey3 } = (init_keys(), __toCommonJS(keys_exports));
    const { didFromPublicKey: didFromPublicKey2 } = (init_multikey(), __toCommonJS(multikey_exports));
    this._privateKey = privateKey;
    this._publicKey = getPublicKey3(privateKey);
    this._did = didFromPublicKey2(this._publicKey);
    this._lifetime = tokenLifetimeSeconds;
  }
  apply(headers) {
    const { createEdDSAJWT: createEdDSAJWT2 } = (init_jwt(), __toCommonJS(jwt_exports));
    const jwt = createEdDSAJWT2(this._privateKey, this._lifetime);
    headers["Authorization"] = `Bearer ${jwt}`;
  }
  /** The caller's DID derived from the public key. */
  getDID() {
    return this._did;
  }
  /** The 32-byte Ed25519 public key. */
  getPublicKey() {
    return this._publicKey;
  }
  /** Generate a new random keypair and return a KeyPairAuth instance. */
  static generate(tokenLifetimeSeconds = 300) {
    const { generateKeyPair: generateKeyPair2 } = (init_keys(), __toCommonJS(keys_exports));
    const { privateKey } = generateKeyPair2();
    return new _KeyPairAuth(privateKey, tokenLifetimeSeconds);
  }
  /** Create from a hex-encoded private key string. */
  static fromHex(privateKeyHex, tokenLifetimeSeconds = 300) {
    const { hexToPrivateKey: hexToPrivateKey2 } = (init_keys(), __toCommonJS(keys_exports));
    return new _KeyPairAuth(hexToPrivateKey2(privateKeyHex), tokenLifetimeSeconds);
  }
};
var CredentialsHTTP = class {
  constructor(venueId, apiKey, userId) {
    this.venueId = venueId;
    this.apiKey = apiKey;
    this.userId = userId;
  }
};

// src/Logger.ts
var defaultHandler = (_level, message) => {
  console.debug(`[covia] ${message}`);
};
var logger = {
  level: "none",
  handler: defaultHandler,
  debug(message) {
    if (this.level === "debug") {
      this.handler("debug", message);
    }
  }
};

// src/Utils.ts
async function parseErrorBody(response) {
  let body = null;
  let message = `Request failed with status ${response.status}`;
  try {
    body = await response.json();
    if (body?.error) {
      message = body.error;
    }
  } catch {
    try {
      const text = await response.text();
      if (text) message = text;
    } catch {
    }
  }
  return { message, body };
}
async function throwHttpError(response) {
  const { message, body } = await parseErrorBody(response);
  if (response.status === 404) {
    throw new NotFoundError(message);
  }
  throw new GridError(response.status, message, body);
}
function wrapError(error) {
  if (error instanceof CoviaError) return error;
  const msg = error.message ?? String(error);
  if (error instanceof TypeError) {
    return new CoviaConnectionError(msg);
  }
  return new CoviaError(`Request failed: ${msg}`);
}
async function fetchWithError(url, options) {
  const method = options?.method ?? "GET";
  logger.debug(`${method} ${url}`);
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const msg = error.message ?? String(error);
    logger.debug(`Connection failed: ${method} ${url} \u2014 ${msg}`);
    throw wrapError(error);
  }
  logger.debug(`${method} ${url} \u2192 ${response.status}`);
  if (!response.ok) {
    await throwHttpError(response);
  }
  return response.json();
}
async function fetchStreamWithError(url, options) {
  const method = options?.method ?? "GET";
  logger.debug(`${method} ${url}`);
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const msg = error.message ?? String(error);
    logger.debug(`Connection failed: ${method} ${url} \u2014 ${msg}`);
    throw wrapError(error);
  }
  logger.debug(`${method} ${url} \u2192 ${response.status}`);
  if (!response.ok) {
    await throwHttpError(response);
  }
  return response;
}
function isJobComplete(jobStatus) {
  if (jobStatus == null)
    return false;
  return jobStatus == "COMPLETE" /* COMPLETE */ ? true : false;
}
function isJobPaused(jobStatus) {
  if (jobStatus == null)
    return false;
  return jobStatus == "PAUSED" /* PAUSED */ || jobStatus == "INPUT_REQUIRED" /* INPUT_REQUIRED */ || jobStatus == "AUTH_REQUIRED" /* AUTH_REQUIRED */;
}
function isJobFinished(jobStatus) {
  if (jobStatus == null)
    return false;
  if (jobStatus == "COMPLETE" /* COMPLETE */) return true;
  if (jobStatus == "FAILED" /* FAILED */) return true;
  if (jobStatus == "REJECTED" /* REJECTED */) return true;
  if (jobStatus == "CANCELLED" /* CANCELLED */) return true;
  if (jobStatus == "TIMEOUT" /* TIMEOUT */) return true;
  return false;
}
function getParsedAssetId(assetId) {
  if (assetId.startsWith("did:web")) {
    const parts = assetId.split("/");
    return parts[parts.length - 1];
  }
  return assetId;
}
function getAssetIdFromPath(assetHex, assetPath) {
  const venueDid = decodeURIComponent(assetPath.split("/")[4]);
  return venueDid + "/a/" + assetHex;
}
function getAssetIdFromVenueId(assetHex, venueId) {
  return venueId + "/a/" + assetHex;
}
function createSSEEvent(fields) {
  const data = fields.data ?? "";
  return {
    event: fields.event || null,
    data,
    id: fields.id || null,
    retry: fields.retry ?? null,
    json() {
      return JSON.parse(data);
    }
  };
}
async function* parseSSEStream(response) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  let event;
  let data = [];
  let id;
  let retry;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "") {
          if (data.length > 0 || event !== void 0) {
            yield createSSEEvent({
              event,
              data: data.join("\n"),
              id,
              retry
            });
            event = void 0;
            data = [];
            id = void 0;
            retry = void 0;
          }
          continue;
        }
        if (line.startsWith(":")) continue;
        const colonIdx = line.indexOf(":");
        let field;
        let val;
        if (colonIdx === -1) {
          field = line;
          val = "";
        } else {
          field = line.slice(0, colonIdx);
          val = line.slice(colonIdx + 1);
          if (val.startsWith(" ")) val = val.slice(1);
        }
        switch (field) {
          case "event":
            event = val;
            break;
          case "data":
            data.push(val);
            break;
          case "id":
            id = val;
            break;
          case "retry": {
            const n = parseInt(val, 10);
            if (!isNaN(n)) retry = n;
            break;
          }
        }
      }
    }
    if (data.length > 0 || event !== void 0) {
      yield createSSEEvent({ event, data: data.join("\n"), id, retry });
    }
  } finally {
    reader.releaseLock();
  }
}

// src/AgentManager.ts
var AgentManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  async create(input) {
    return this.venue.operations.run("agent:create", input);
  }
  async request(agentId, input, wait) {
    return this.venue.operations.run("agent:request", { agentId, input, wait });
  }
  async message(agentId, message) {
    return this.venue.operations.run("agent:message", { agentId, message });
  }
  async trigger(agentId) {
    return this.venue.operations.run("agent:trigger", { agentId });
  }
  async query(agentId) {
    return this.venue.operations.run("agent:query", { agentId });
  }
  async list(includeTerminated) {
    return this.venue.operations.run("agent:list", { includeTerminated });
  }
  async delete(agentId, remove) {
    return this.venue.operations.run("agent:delete", { agentId, remove });
  }
  async suspend(agentId) {
    return this.venue.operations.run("agent:suspend", { agentId });
  }
  async resume(agentId, autoWake) {
    return this.venue.operations.run("agent:resume", { agentId, autoWake });
  }
  async update(input) {
    return this.venue.operations.run("agent:update", input);
  }
  async cancelTask(agentId, taskId) {
    return this.venue.operations.run("agent:cancelTask", { agentId, taskId });
  }
};

// src/Job.ts
var INITIAL_POLL_DELAY = 300;
var BACKOFF_FACTOR = 1.5;
var MAX_POLL_DELAY = 1e4;
var Job = class {
  constructor(id, venue, metadata) {
    this.id = id;
    this.venue = venue;
    this.metadata = metadata;
    this._jobs = venue.jobs;
  }
  /**
   * Whether the job has reached a terminal state
   */
  get isFinished() {
    return this.metadata.status != null && isJobFinished(this.metadata.status);
  }
  /**
   * Whether the job completed successfully
   */
  get isComplete() {
    return this.metadata.status != null && isJobComplete(this.metadata.status);
  }
  /**
   * The job output.
   * @throws {Error} If the job has not finished yet.
   * @throws {JobFailedError} If the job finished with a non-COMPLETE status.
   */
  get output() {
    if (!this.isFinished) {
      throw new Error(`Job is not finished (status: ${this.metadata.status})`);
    }
    if (!this.isComplete) {
      throw new JobFailedError(this.metadata);
    }
    return this.metadata.output;
  }
  /**
   * Poll the venue for the latest job status.
   * @throws {Error} If the job has no ID.
   */
  async refresh() {
    if (!this.id) {
      throw new Error("Cannot refresh a job with no ID");
    }
    const job = await this.venue.getJob(this.id);
    this.metadata = job.metadata;
  }
  /**
   * Wait until the job reaches a terminal state.
   * Uses exponential backoff polling (initial 300ms, factor 1.5, max 10s).
   * @param options.timeout - Maximum milliseconds to wait. Undefined waits indefinitely.
   * @throws {CoviaTimeoutError} If timeout is exceeded.
   */
  async wait(options) {
    if (this.isFinished) return;
    let delay = INITIAL_POLL_DELAY;
    const start = Date.now();
    logger.debug(`Polling job ${this.id} (status: ${this.metadata.status})`);
    while (!this.isFinished) {
      if (options?.timeout !== void 0 && Date.now() - start > options.timeout) {
        throw new CoviaTimeoutError(`Job ${this.id} did not finish within ${options.timeout}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      await this.refresh();
      logger.debug(`Job ${this.id} polled \u2192 ${this.metadata.status} (delay=${(delay / 1e3).toFixed(1)}s)`);
      delay = Math.min(delay * BACKOFF_FACTOR, MAX_POLL_DELAY);
    }
  }
  /**
   * Wait for the job to complete and return its output.
   * @param options.timeout - Maximum milliseconds to wait.
   * @returns The job output.
   * @throws {JobFailedError} If the job finishes with a non-COMPLETE status.
   * @throws {CoviaTimeoutError} If timeout is exceeded.
   */
  async result(options) {
    await this.wait(options);
    return this.output;
  }
  /**
   * Stream server-sent events for this job.
   * @returns AsyncGenerator yielding SSEEvent objects
   */
  async *stream() {
    yield* this._jobs.stream(this.id);
  }
  /**
   * Whether the job is paused (PAUSED, INPUT_REQUIRED, or AUTH_REQUIRED)
   */
  get isPaused() {
    return this.metadata.status != null && isJobPaused(this.metadata.status);
  }
  /**
   * Whether the job requires user input
   */
  get needsInput() {
    return this.metadata.status === "INPUT_REQUIRED" /* INPUT_REQUIRED */;
  }
  /**
   * Whether the job requires authentication
   */
  get needsAuth() {
    return this.metadata.status === "AUTH_REQUIRED" /* AUTH_REQUIRED */;
  }
  /**
   * Send a message to the running job
   * @param message - Message payload
   * @returns {Promise<any>}
   */
  async sendMessage(message) {
    return this._jobs.sendMessage(this.id, message);
  }
  /**
   * Pause the job
   * @returns {Promise<JobMetadata>} Updated job metadata
   */
  async pause() {
    this.metadata = await this._jobs.pause(this.id);
    return this.metadata;
  }
  /**
   * Resume the job
   * @returns {Promise<JobMetadata>} Updated job metadata
   */
  async resume() {
    this.metadata = await this._jobs.resume(this.id);
    return this.metadata;
  }
  /**
   * Cancel the job
   * @returns {Promise<JobMetadata>} Updated job metadata
   */
  async cancel() {
    this.metadata = await this._jobs.cancel(this.id);
    return this.metadata;
  }
  /**
   * Delete the job
   */
  async delete() {
    return this._jobs.delete(this.id);
  }
};

// src/JobManager.ts
var JobManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  async list() {
    return fetchWithError(`${this.venue.baseUrl}/api/v1/jobs`);
  }
  async get(jobId) {
    try {
      const data = await fetchWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}`);
      return new Job(jobId, this.venue, data);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async cancel(jobId) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/cancel`, {
        method: "PUT",
        headers: this._buildHeaders()
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async delete(jobId) {
    try {
      await fetchStreamWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/delete`, {
        method: "PUT",
        headers: this._buildHeaders()
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async pause(jobId) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/pause`, {
        method: "PUT",
        headers: this._buildHeaders()
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async resume(jobId) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/resume`, {
        method: "PUT",
        headers: this._buildHeaders()
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async sendMessage(jobId, message) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}`, {
        method: "POST",
        headers: this._buildHeaders(),
        body: JSON.stringify(message)
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async *stream(jobId) {
    const response = await fetchStreamWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/sse`, {
      headers: { ...this._buildHeaders(), "Accept": "text/event-stream" }
    });
    yield* parseSSEStream(response);
  }
  _buildHeaders() {
    const headers = { "Content-Type": "application/json" };
    this.venue.auth.apply(headers);
    return headers;
  }
};

// src/Asset.ts
var cache = /* @__PURE__ */ new Map();
var Asset = class {
  constructor(id, venue, metadata = {}) {
    this.id = id;
    this.venue = venue;
    this.metadata = metadata;
    this._assets = venue.assets;
    this._operations = venue.operations;
  }
  /**
   * Get asset metadata
   * @returns {Promise<AssetMetadata>}
   */
  async getMetadata() {
    if (cache.has(this.id)) {
      return Promise.resolve(cache.get(this.id));
    } else {
      const data = this._assets.getMetadata(this.id);
      if (data) {
        cache.set(this.id, data);
      }
      return data;
    }
  }
  /**
   * Put content to asset
   * @param content - Content to upload
   * @returns {Promise<ContentHashResult>} The content hash returned by the server
   */
  putContent(content) {
    return this._assets.putContent(this.id, content);
  }
  /**
   * Get asset content
   * @returns {Promise<ReadableStream<Uint8Array> | null>}
   */
  getContent() {
    return this._assets.getContent(this.id);
  }
  /**
   * Get the URL for downloading asset content
   * @returns {string} The URL for downloading the asset content
   */
  getContentURL() {
    return `${this.venue.baseUrl}/api/v1/assets/${this.id}/content`;
  }
  /**
   * Execute the operation
   * @param input - Operation input parameters
   * @returns {Promise<any>}
   */
  run(input) {
    return this._operations.run(this.id, input);
  }
  /**
  * Execute the operation
  * @param input - Operation input parameters
  * @returns {Promise<Job>}
  */
  invoke(input) {
    return this._operations.invoke(this.id, input);
  }
};

// src/Operation.ts
var Operation = class extends Asset {
  constructor(id, venue, metadata = {}) {
    super(id, venue, metadata);
  }
  // Operation-specific methods can be added here
  // For now, it inherits all functionality from Asset
};

// src/DataAsset.ts
var DataAsset = class extends Asset {
  constructor(id, venue, metadata = {}) {
    super(id, venue, metadata);
  }
  // DataAsset-specific methods can be added here
  // For now, it inherits all functionality from Asset
};

// src/AssetManager.ts
var cache2 = /* @__PURE__ */ new Map();
var AssetManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  /**
   * Get asset by ID
   * @param assetId - Asset identifier
   * @returns Returns either an Operation or DataAsset based on the asset's metadata
   */
  async get(assetId) {
    if (cache2.has(assetId)) {
      const cachedData = cache2.get(assetId);
      if (cachedData.metadata?.operation) {
        return new Operation(assetId, this.venue, cachedData);
      } else {
        return new DataAsset(assetId, this.venue, cachedData);
      }
    }
    try {
      const data = await fetchWithError(`${this.venue.baseUrl}/api/v1/assets/${assetId}`);
      cache2.set(assetId, data);
      if (data.metadata?.operation) {
        return new Operation(assetId, this.venue, data);
      } else {
        return new DataAsset(assetId, this.venue, data);
      }
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }
  /**
   * List assets with pagination support
   * @param options - Pagination options (offset, limit)
   */
  async list(options = {}) {
    const params = new URLSearchParams();
    params.set("offset", String(options.offset ?? 0));
    if (options.limit !== void 0) {
      params.set("limit", String(options.limit));
    }
    return fetchWithError(`${this.venue.baseUrl}/api/v1/assets?${params.toString()}`);
  }
  /**
   * Register a new asset
   * @param assetData - Asset configuration
   */
  async register(assetData) {
    return fetchWithError(`${this.venue.baseUrl}/api/v1/assets`, {
      method: "POST",
      headers: this._buildHeaders(),
      body: JSON.stringify(assetData)
    }).then((response) => this.get(response));
  }
  /**
   * Get asset metadata
   * @param assetId - Asset identifier
   */
  async getMetadata(assetId) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/assets/${assetId}`);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }
  /**
   * Put content to asset
   * @param assetId - Asset identifier
   * @param content - Content to upload
   * @returns The content hash returned by the server
   */
  async putContent(assetId, content) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/assets/${assetId}/content`, {
        method: "PUT",
        headers: this._buildHeaders(),
        body: content
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }
  /**
   * Get asset content
   * @param assetId - Asset identifier
   */
  async getContent(assetId) {
    try {
      const response = await fetchStreamWithError(`${this.venue.baseUrl}/api/v1/assets/${assetId}/content`);
      return response.body;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }
  /**
   * Clear the asset cache.
   */
  clearCache() {
    cache2.clear();
  }
  _buildHeaders() {
    const headers = { "Content-Type": "application/json" };
    this.venue.auth.apply(headers);
    return headers;
  }
};

// src/OperationManager.ts
var OperationManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  /**
   * List all named operations available on this venue
   */
  async list() {
    return fetchWithError(`${this.venue.baseUrl}/api/v1/operations`);
  }
  /**
   * Get details of a named operation
   * @param name - Operation name (e.g., "test:echo")
   */
  async get(name) {
    return fetchWithError(`${this.venue.baseUrl}/api/v1/operations/${name}`);
  }
  /**
   * Execute an operation and wait for the result
   * @param assetId - Operation asset ID or named operation
   * @param input - Operation input parameters
   * @param options - Invoke options (e.g., ucans)
   */
  async run(assetId, input, options) {
    const job = await this.invoke(assetId, input, options);
    return job.result();
  }
  /**
   * Execute an operation and return a Job for tracking
   * @param assetId - Operation asset ID or named operation
   * @param input - Operation input parameters
   * @param options - Invoke options (e.g., ucans)
   */
  async invoke(assetId, input, options) {
    const payload = {
      operation: assetId,
      input
    };
    if (options?.ucans) {
      payload.ucans = options.ucans;
    }
    const response = await fetchWithError(`${this.venue.baseUrl}/api/v1/invoke`, {
      method: "POST",
      headers: this._buildHeaders(),
      body: JSON.stringify(payload)
    });
    return new Job(response?.id, this.venue, response);
  }
  _buildHeaders() {
    const headers = { "Content-Type": "application/json" };
    this.venue.auth.apply(headers);
    return headers;
  }
};

// src/WorkspaceManager.ts
var WorkspaceManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  async read(path, maxSize) {
    return this.venue.operations.run("covia:read", { path, maxSize });
  }
  async write(path, value) {
    return this.venue.operations.run("covia:write", { path, value });
  }
  async delete(path) {
    return this.venue.operations.run("covia:delete", { path });
  }
  async append(path, value) {
    return this.venue.operations.run("covia:append", { path, value });
  }
  async list(path, limit, offset) {
    return this.venue.operations.run("covia:list", { path, limit, offset });
  }
  async slice(path, offset, limit) {
    return this.venue.operations.run("covia:slice", { path, offset, limit });
  }
  async functions() {
    return this.venue.operations.run("covia:functions", {});
  }
  async describe(name) {
    return this.venue.operations.run("covia:describe", { name });
  }
  async adapters() {
    return this.venue.operations.run("covia:adapters", {});
  }
};

// src/UCANManager.ts
var UCANManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  async issue(aud, att, exp) {
    return this.venue.operations.run("ucan:issue", { aud, att, exp });
  }
};

// src/SecretManager.ts
var SecretManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  async set(name, value) {
    return this.venue.operations.run("secret:set", { name, value });
  }
  /**
   * Extract a secret value by name.
   * NOTE: This operation requires a UCAN capability grant. The backend
   * may reject requests that lack the appropriate capability proof.
   */
  async extract(name) {
    return this.venue.operations.run("secret:extract", { name });
  }
  async list() {
    return this.venue.listSecrets();
  }
  async put(name, value) {
    return this.venue.putSecret(name, value);
  }
  async delete(name) {
    return this.venue.deleteSecret(name);
  }
};
var webResolver = getResolver();
var resolver = new Resolver(webResolver);
var Venue = class _Venue {
  get agents() {
    return this._agents ?? (this._agents = new AgentManager(this));
  }
  get jobs() {
    return this._jobs ?? (this._jobs = new JobManager(this));
  }
  get assets() {
    return this._assets ?? (this._assets = new AssetManager(this));
  }
  get operations() {
    return this._operations ?? (this._operations = new OperationManager(this));
  }
  get workspace() {
    return this._workspace ?? (this._workspace = new WorkspaceManager(this));
  }
  get ucan() {
    return this._ucan ?? (this._ucan = new UCANManager(this));
  }
  get secrets() {
    return this._secrets ?? (this._secrets = new SecretManager(this));
  }
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || "";
    this.venueId = options.venueId || "";
    this.auth = options.auth || new NoAuth();
    this.metadata = {
      name: options.name || "default",
      description: options.description || ""
    };
  }
  /**
   * Static method to connect to a venue
   * @param venueId - Can be a HTTP base URL, DNS name, or existing Venue instance
   * @param credentials - Optional credentials for venue authentication
   * @returns {Promise<Venue>} A new Venue instance configured appropriately
   */
  static async connect(venueId, auth) {
    if (venueId instanceof _Venue) {
      return new _Venue({
        baseUrl: venueId.baseUrl,
        venueId: venueId.venueId,
        name: venueId.metadata.name,
        auth
      });
    }
    if (typeof venueId === "string") {
      let baseUrl;
      if (venueId.startsWith("http:") || venueId.startsWith("https:")) {
        baseUrl = venueId;
        if (baseUrl.endsWith("/"))
          baseUrl = baseUrl.substring(0, baseUrl.length - 1);
      } else if (venueId.startsWith("did:web:")) {
        const didDoc = await resolver.resolve(venueId);
        if (!didDoc.didDocument) {
          throw new CoviaError("Invalid DID document");
        }
        const endpoint = didDoc.didDocument.service?.find((service) => service.type === "Covia.API.v1")?.serviceEndpoint;
        if (!endpoint) {
          throw new CoviaError("No endpoint found for DID");
        }
        baseUrl = endpoint.toString().replace(/\/api\/v1/, "");
      } else {
        baseUrl = `https://${venueId}`;
      }
      const data = await fetchWithError(baseUrl + "/api/v1/status");
      return new _Venue({
        baseUrl,
        venueId: data.did,
        name: data.name,
        auth
      });
    }
    throw new CoviaError("Invalid venue ID parameter. Must be a string (URL/DNS) or Venue instance.");
  }
  /**
   * Get asset by ID (convenience delegate to venue.assets.get)
   * @param assetId - Asset identifier
   * @returns {Promise<Asset>} Returns either an Operation or DataAsset based on the asset's metadata
   */
  async getAsset(assetId) {
    return this.assets.get(assetId);
  }
  /**
   * List assets with pagination support (convenience delegate to venue.assets.list)
   * @param options - Pagination options (offset, limit)
   * @returns {Promise<AssetList>} Paginated list of asset IDs with metadata
   */
  async listAssets(options = {}) {
    return this.assets.list(options);
  }
  /**
   * List all jobs
   * @returns {Promise<string[]>}
   */
  async listJobs() {
    return this.jobs.list();
  }
  /**
   * Get job by ID
   * @param jobId - Job identifier
   * @returns {Promise<Job>}
   */
  async getJob(jobId) {
    return this.jobs.get(jobId);
  }
  /**
   * List secret names
   * @returns {Promise<string[]>}
   */
  async listSecrets() {
    const result = await fetchWithError(`${this.baseUrl}/api/v1/secrets`, {
      headers: this._buildHeaders()
    });
    return result.items;
  }
  /**
   * Store a secret value
   * @param name - Secret name
   * @param value - Secret value
   */
  async putSecret(name, value) {
    await fetchWithError(`${this.baseUrl}/api/v1/secrets/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: this._buildHeaders(),
      body: JSON.stringify({ value })
    });
  }
  /**
   * Delete a secret
   * @param name - Secret name
   */
  async deleteSecret(name) {
    await fetchStreamWithError(`${this.baseUrl}/api/v1/secrets/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: this._buildHeaders()
    });
  }
  /**
   * Get venue status
   * @returns {Promise<StatusData>}
   */
  status() {
    return fetchWithError(`${this.baseUrl}/api/v1/status`);
  }
  /**
   * Get the full DID document for this venue
   * @returns {Promise<DIDDocument>}
   */
  async didDocument() {
    return fetchWithError(`${this.baseUrl}/.well-known/did.json`);
  }
  /**
   * Get MCP (Model Context Protocol) discovery information
   * @returns {Promise<MCPDiscovery>}
   */
  async mcpDiscovery() {
    return fetchWithError(`${this.baseUrl}/.well-known/mcp`);
  }
  /**
   * Get the A2A (Agent-to-Agent) agent card
   * @returns {Promise<AgentCard>}
   */
  async agentCard() {
    return fetchWithError(`${this.baseUrl}/.well-known/agent-card.json`);
  }
  /**
   * Close the venue and release resources.
   * Clears cached asset data for this venue.
   */
  close() {
    this.assets.clearCache();
  }
  /**
   * Disposable support — allows `using venue = await Grid.connect(...)` in TS 5.2+.
   */
  [Symbol.dispose]() {
    this.close();
  }
  _buildHeaders() {
    const headers = { "Content-Type": "application/json" };
    this.auth.apply(headers);
    return headers;
  }
};

// src/Grid.ts
var cache3 = /* @__PURE__ */ new Map();
var Grid = class {
  /**
  * Static method to connect to a venue
  * @param venueId - Can be a HTTP base URL, DNS name, or existing Venue instance
  * @param auth - Optional authentication provider (BearerAuth, KeyPairAuth, etc.)
  * @returns {Promise<Venue>} A new Venue instance configured appropriately
  */
  static async connect(venueId, auth) {
    if (cache3.has(venueId))
      return Promise.resolve(cache3.get(venueId));
    const connectedVenue = await Venue.connect(venueId, auth);
    cache3.set(venueId, connectedVenue);
    return Promise.resolve(connectedVenue);
  }
};

// src/index.ts
init_keys();
init_multikey();
/*! Bundled license information:

@noble/ed25519/index.js:
  (*! noble-ed25519 - MIT License (c) 2019 Paul Miller (paulmillr.com) *)

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/

export { AgentManager, AgentStatus, Asset, AssetManager, AssetNotFoundError, Auth, BearerAuth, CoviaConnectionError, CoviaError, CoviaTimeoutError, CredentialsHTTP, DataAsset, Grid, GridError, Job, JobFailedError, JobManager, JobNotFoundError, JobStatus, KeyPairAuth, NoAuth, NotFoundError, Operation, OperationManager, RunStatus, SecretManager, UCANManager, Venue, WorkspaceManager, createSSEEvent, decodePublicKey, didFromPublicKey, encodePublicKey, fetchStreamWithError, fetchWithError, generateKeyPair, getAssetIdFromPath, getAssetIdFromVenueId, getParsedAssetId, hexToPrivateKey, isJobComplete, isJobFinished, isJobPaused, logger, parseSSEStream, privateKeyToHex };
