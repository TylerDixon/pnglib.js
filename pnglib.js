/**
* A handy class to calculate color values.
*
* @version 1.0
* @author Robert Eisele <robert@xarg.org>
* @copyright Copyright (c) 2010, Robert Eisele
* @link http://www.xarg.org/2010/03/generate-client-side-png-files-using-javascript/
* @license http://www.opensource.org/licenses/bsd-license.php BSD License
*
*/

var PNGLib = (function() {
    var base64Characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    function base64Encode(str) {
        var CHARS = base64Characters;
        var out = "", i = 0, len = str.length, c1, c2, c3;
        while (i < len) {
            c1 = str.charCodeAt(i++) & 0xff;
            if (i == len) {
                out += CHARS.charAt(c1 >> 2);
                out += CHARS.charAt((c1 & 0x3) << 4);
                out += "==";
                break;
            }
            c2 = str.charCodeAt(i++);
            if (i == len) {
                out += CHARS.charAt(c1 >> 2);
                out += CHARS.charAt(((c1 & 0x3)<< 4) | ((c2 & 0xF0) >> 4));
                out += CHARS.charAt((c2 & 0xF) << 2);
                out += "=";
                break;
            }
            c3 = str.charCodeAt(i++);
            out += CHARS.charAt(c1 >> 2);
            out += CHARS.charAt(((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4));
            out += CHARS.charAt(((c2 & 0xF) << 2) | ((c3 & 0xC0) >> 6));
            out += CHARS.charAt(c3 & 0x3F);
        }
        return out;
    }

	// helper functions for that ctx
	function byte2(w) {
		return String.fromCharCode((w >> 8) & 255, w & 255);
	}

	function byte4(w) {
		return String.fromCharCode((w >> 24) & 255, (w >> 16) & 255, (w >> 8) & 255, w & 255);
	}

	function byte2lsb(w) {
		return String.fromCharCode(w & 255, (w >> 8) & 255);
	}

    function toInt32(bytes) {
        return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    }

    function PNGLib(){}

    PNGLib.prototype = {
        fromSize: function (width, height, depth) {

            this.width   = width;
            this.height  = height;
            this.depth   = depth;

            // pixel data and row filter identifier size
            this.pix_size = height * (width + 1);

            // deflate header, pix_size, block headers, adler32 checksum
            this.data_size = 2 + this.pix_size + 5 * Math.floor((0xfffe + this.pix_size) / 0xffff) + 4;

            // offsets and sizes of Png chunks
            this.ihdr_offs = 0;									// IHDR offset and size
            this.ihdr_size = 4 + 4 + 13 + 4;
            this.plte_offs = this.ihdr_offs + this.ihdr_size;	// PLTE offset and size
            this.plte_size = 4 + 4 + 3 * depth + 4;
            this.trns_offs = this.plte_offs + this.plte_size;	// tRNS offset and size
            this.trns_size = 4 + 4 + depth + 4;
            this.idat_offs = this.trns_offs + this.trns_size;	// IDAT offset and size
            this.idat_size = 4 + 4 + this.data_size + 4;
            this.iend_offs = this.idat_offs + this.idat_size;	// IEND offset and size
            this.iend_size = 4 + 4 + 4;
            this.buffer_size  = this.iend_offs + this.iend_size;	// total PNG size

            this.buffer  = [];
            this.palette = {};
            this.pindex  = 0;

            // initialize buffer with zero bytes
            for (var i = 0; i < this.buffer_size; i++) {
                this.buffer[i] = "\x00";
            }

            // initialize non-zero elements
            this
                .write(this.ihdr_offs, byte4(this.ihdr_size - 12), 'IHDR', byte4(width), byte4(height), "\x08\x03")
                .write(this.plte_offs, byte4(this.plte_size - 12), 'PLTE')
                .write(this.trns_offs, byte4(this.trns_size - 12), 'tRNS')
                .write(this.idat_offs, byte4(this.idat_size - 12), 'IDAT')
                .write(this.iend_offs, byte4(this.iend_size - 12), 'IEND');

            // initialize deflate header
            var header = ((8 + (7 << 4)) << 8) | (3 << 6);
            header+= 31 - (header % 31);

            this.write(this.idat_offs + 8, byte2(header));

            // initialize deflate block headers
            for (var i = 0; (i << 16) - 1 < this.pix_size; i++) {
                var size, bits;
                if (i + 0xffff < this.pix_size) {
                    size = 0xffff;
                    bits = "\x00";
                } else {
                    size = this.pix_size - (i << 16) - i;
                    bits = "\x01";
                }
                this.write(this.idat_offs + 8 + 2 + (i << 16) + (i << 2), bits, byte2lsb(size), byte2lsb(~size));
            }

            /* Create crc32 lookup table */
            for (var i = 0; i < 256; i++) {
                var c = i;
                for (var j = 0; j < 8; j++) {
                    if (c & 1) {
                        c = -306674912 ^ ((c >> 1) & 0x7fffffff);
                    } else {
                        c = (c >> 1) & 0x7fffffff;
                    }
                }
                this._crc32[i] = c;
            }

            return this;
        },

        //http://stackoverflow.com/questions/15327959/get-height-and-width-dimensions-from-base64-png#answer-15327988
        fromRaw: function(rawData, cb) {
            var data = base64Encode(rawData);
            var result = [];
            var current = 0;

            for(var i = 0, c; c = data.charAt(i); i++) {
                if(c === '=') {
                    if(i !== data.length - 1 && (i !== data.length - 2 || data.charAt(i + 1) !== '=')) {
                        throw new SyntaxError('Unexpected padding character.');
                    }

                    break;
                }

                var index = base64Characters.indexOf(c);

                if(index === -1) {
                    throw new SyntaxError('Invalid Base64 character.');
                }

                current = (current << 6) | index;

                if(i % 4 === 3) {
                    result.push(current >> 16, (current & 0xff00) >> 8, current & 0xff);
                    current = 0;
                }
            }

            if(i % 4 === 1) {
                throw new SyntaxError('Invalid length for a Base64 string.');
            }

            if(i % 4 === 2) {
                result.push(current >> 4);
            } else if(i % 4 === 3) {
                current <<= 6;
                result.push(current >> 16, (current & 0xff00) >> 8);
            }

            var width = toInt32(result.slice(16, 20));
            var height = toInt32(result.slice(20, 24));

            cb(result, width, height);
        },


        // convert a color and build up the palette
        color: function(red, green, blue, alpha) {

            alpha = alpha >= 0 ? alpha : 255;
            var color = (((((alpha << 8) | red) << 8) | green) << 8) | blue;

            if (typeof this.palette[color] == "undefined") {
                if (this.pindex == this.depth) return "\x00";

                var ndx = this.plte_offs + 8 + 3 * this.pindex;

                this.buffer[ndx + 0] = String.fromCharCode(red);
                this.buffer[ndx + 1] = String.fromCharCode(green);
                this.buffer[ndx + 2] = String.fromCharCode(blue);
                this.buffer[this.trns_offs+8+this.pindex] = String.fromCharCode(alpha);

                this.palette[color] = String.fromCharCode(this.pindex++);
            }
            return this.palette[color];
        },

        // output a PNG string, Base64 encoded
        getBase64: function() {

            var s = this.getDump();

            var ch = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
            var c1, c2, c3, e1, e2, e3, e4;
            var l = s.length;
            var i = 0;
            var r = "";

            do {
                c1 = s.charCodeAt(i);
                e1 = c1 >> 2;
                c2 = s.charCodeAt(i+1);
                e2 = ((c1 & 3) << 4) | (c2 >> 4);
                c3 = s.charCodeAt(i+2);
                if (l < i+2) { e3 = 64; } else { e3 = ((c2 & 0xf) << 2) | (c3 >> 6); }
                if (l < i+3) { e4 = 64; } else { e4 = c3 & 0x3f; }
                r+= ch.charAt(e1) + ch.charAt(e2) + ch.charAt(e3) + ch.charAt(e4);
            } while ((i+= 3) < l);
            return r;
        },

        // output a PNG string
        getDump: function() {

            // compute adler32 of output pixels + row filter bytes
            var BASE = 65521; /* largest prime smaller than 65536 */
            var NMAX = 5552;  /* NMAX is the largest n such that 255n(n+1)/2 + (n+1)(BASE-1) <= 2^32-1 */
            var s1 = 1;
            var s2 = 0;
            var n = NMAX;

            for (var y = 0; y < this.height; y++) {
                for (var x = -1; x < this.width; x++) {
                    s1+= this.buffer[this.index(x, y)].charCodeAt(0);
                    s2+= s1;
                    if ((n-= 1) == 0) {
                        s1%= BASE;
                        s2%= BASE;
                        n = NMAX;
                    }
                }
            }
            s1%= BASE;
            s2%= BASE;

            this
                .write(this.idat_offs + this.idat_size - 8, byte4((s2 << 16) | s1))

                .crc32(this.ihdr_offs, this.ihdr_size)
                .crc32(this.plte_offs, this.plte_size)
                .crc32(this.trns_offs, this.trns_size)
                .crc32(this.idat_offs, this.idat_size)
                .crc32(this.iend_offs, this.iend_size);

            // convert PNG to string
            return "\211PNG\r\n\032\n"+this.buffer.join('');
        },
        write: function(offs) {
            for (var i = 2; i < arguments.length; i++) {
                for (var j = 0; j < arguments[i].length; j++) {
                    this.buffer[offs++] = arguments[i].charAt(j);
                }
            }

            return this;
        },

        _crc32: [],
        // compute crc32 of the PNG chunks
        crc32: function (offs, size) {
            var crc = -1;
            for (var i = 4; i < size-4; i += 1) {
                crc = this._crc32[(crc ^ this.buffer[offs+i].charCodeAt(0)) & 0xff] ^ ((crc >> 8) & 0x00ffffff);
            }
            this.write(offs+size-4, byte4(crc ^ -1));

            return this;
        }
    };

    return PNGLib;
})();
