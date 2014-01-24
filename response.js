/*!
 * @link http://responsejs.com
 * @link http://github.com/ryanve/response.js
 * @copyright 2014 Ryan Van Etten
 * @license MIT
 * @version 0.7.10
 */
 
/*jshint expr:true, sub:true, supernew:true, debug:true, node:true, boss:true, devel:true, evil:true, 
  laxcomma:true, eqnull:true, undef:true, unused:true, browser:true, jquery:true, maxerr:100 */

(function(root, name, factory) {
    var $ = root['jQuery'] || root['Zepto'] || root['ender'] || root['elo'];
    if (typeof module != 'undefined' && module['exports']) module['exports'] = factory($);
    else root[name] = factory($);
    // see @link github.com/ryanve/response.js/pull/9
    // AMD @example `define(['jquery'], factory)
}(this, 'Response', function($) {

    if (typeof $ != 'function') {
        try {// Exit gracefully if dependency is missing:
            console.log('Response was unable to run due to missing dependency.');
        } catch (e) {}
    }

    var Response
      , root = this
      , name = 'Response'
      , old = root[name]
      , initContentKey = 'init' + name // key for storing initial content
      , win = window
      , doc = document
      , docElem = doc.documentElement
      , ready = $.domReady || $
      , $win = $(win) // cache selector
      , screen = win.screen
      , AP = Array.prototype
      , OP = Object.prototype
      , push = AP.push
      , slice = AP.slice
      , concat = AP.concat
      , toString = OP.toString
      , owns = OP.hasOwnProperty
      , isArray = Array.isArray || function(item) {
            return '[object Array]' === toString.call(item);
        }
      , defaultBreakpoints = {
            width: [0, 320, 481, 641, 961, 1025, 1281]  // width  | device-width  (ideal for 960 grids)
          , height: [0, 481]                            // height | device-height (maybe add 801 too)
          , ratio: [1, 1.5, 2]                          // device-pixel-ratio     (!omit trailing zeros!)
        }
      , Elemset, band, wave, device = {}
      , propTests = {}
      , isCustom = {}
      , sets = { all: [] }
      , suid = 1
      , screenW = screen.width   
      , screenH = screen.height  
      , screenMax = screenW > screenH ? screenW : screenH
      , screenMin = screenW + screenH - screenMax
      , deviceW = function() { return screenW; }
      , deviceH = function() { return screenH; }
      , regexFunkyPunc = /[^a-z0-9_\-\.]/gi
      , regexTrimPunc = /^[\W\s]+|[\W\s]+$|/g
      , regexCamels = /([a-z])([A-Z])/g
      , regexDashB4 = /-(.)/g
      , regexDataPrefix = /^data-(.+)$/

      , objectCreate = Object.create || function(proto) {
            /** @constructor */
            function Type() {} // Function to output empty object.
            Type.prototype = proto; // Set prototype property to the proto.
            return new Type; // Instantiate the new object.
        }

      , namespaceIt = function(eventName, customNamespace) {// namepace defaults to 'Response'
            customNamespace = customNamespace || name;
            return eventName.replace(regexTrimPunc, '') + '.' + customNamespace.replace(regexTrimPunc, '');
        }

      , event = {
            allLoaded: namespaceIt('allLoaded') // fires on lazy elemsets when all elems in a set have been loaded once
            //, update: namespaceIt('update')       // fires on each elem in a set each time that elem is updated
          , crossover: namespaceIt('crossover') // fires on window each time dynamic breakpoint bands is crossed
        }
        
        // Response.media (normalized matchMedia)
        // @example Response.media("(orientation:landscape)").matches
        // If both versions are undefined, .matches will equal undefined 
        // Also see: band / wave / device.band / device.wave / dpr
      , matchMedia = win.matchMedia || win.msMatchMedia
      , media = matchMedia || function() { return {}; }
    
        // http://ryanve.com/lab/dimensions
        // http://github.com/ryanve/verge/issues/7
      , viewportW = docElem['clientWidth'] < win['innerWidth'] ? function() {
            return win['innerWidth'];
        } : function() {
            return docElem['clientWidth'];
        }
      , viewportH = docElem['clientHeight'] < win['innerHeight'] ? function() {
            return win['innerHeight'];
        } : function() {
            return docElem['clientHeight'];
        };
    
    function doError(msg) {
        // Error handling. (Throws exception.)
        // Use Ctrl+F to find specific @errors
        throw new TypeError(msg ? name + '.' + msg : name);
    }
    
    function isNumber(item) {// inlined @minification
        return typeof item == 'number' && item === item; // second part stuffs NaN
    }
    
    function map(ob, fn, scope) {
        var i, l = ob.length, ret = [];
        for (i = 0; i < l; i++) ret[i] = fn.call(scope, ob[i], i, ob);
        return ret;
    }

    function ssvToArr(ukn) {
        // Convert space separated values to array. Always returns a compact array:
        return typeof ukn == 'string' ? sift(ukn.split(' ')) : isArray(ukn) ? sift(ukn) : [];
    }

    /**
     * Response.each()
     * @since 0.4.0
     * omits `in` check and supports scope since 0.6.2
     */
    function each(ob, callback, scope) {
        if (null == ob) { return ob; }
        var i = 0, len = ob.length;
        while (i < len) callback.call(scope || ob[i], ob[i], i++, ob); 
        return ob;
    }

    // revamped affix method reintroduced in version 0.4.0:
    // updated again in 0.6.2 to skip null|undef values
    function affix(arr, prefix, suffix) {
        // Return new array with prefix/suffix added to each value.
        // null|undefined values are not included in the new array
        var r = [], l = arr.length, i = 0, v;
        prefix = prefix || '';
        suffix = suffix || '';
        while (i < l) {
            v = arr[i++]; 
            null == v || r.push(prefix + v + suffix);
        }
        return r;
    }

    /**
     * @param {Array|Object} ob is an array or collection to iterate over.
     * @param {(Function|string|*)=} fn is a callback or typestring
     * @param {(Object|boolean|*)=} scope thisArg or invert
     * @since  0.4.0 Updated in 0.6.2 to support scope and typestrings
     * @example Response.sift([5, 0, 'str'], isFinite) // [5, 0]
     * @example Response.sift([5, 0, 'str']) // [5, 'str']
     */
    function sift(ob, fn, scope) {
        var l, u = 0, i = 0, v, ret = [], invert, isF = typeof fn == 'function';
        if (!ob) return ret;
        scope = (invert = true === scope) ? null : scope;
        for (l = ob.length; i < l; i++) {
            v = ob[i]; // save reference to value in case `fn` mutates `ob[i]`
            // Use `=== !` to ensure that the comparison is bool-to-bool
            invert === !(isF ? fn.call(scope, v, i, ob) : fn ? typeof v === fn : v) && (ret[u++] = v);
        }
        return ret;
    }

    /**
     * Response.merge
     * @since 0.3.0
     * @param {Object|Array|Function|*} r receiver
     * @param {Object|Array|Function|*} s supplier Undefined values are ignored.
     * @return {Object|Array|Function|*} receiver
     */
    function merge(r, s) {
        if (null == r || null == s) return r;
        if (typeof s == 'object' && isNumber(s.length)) push.apply(r, sift(s, 'undefined', true));
        else for (var k in s) owns.call(s, k) && void 0 !== s[k] && (r[k] = s[k]);
        return r;
    }

    /**
     * Response.route()  Handler method for accepting args as arrays or singles, for 
     *   callbacks. Returns self for chaining.
     * @since 0.3.0 scope support added in 0.6.2
     * @param {*} item  If `item` is an array or array-like object then `callback` gets called
     *   on each member. Otherwise `callback` is called on the `item` itself.
     * @param {Function} fn The function to call on item(s).
     * @param {*=} scope  thisArg (defaults to current item)
     */
    function route(item, fn, scope) {
        // If item is array-like then call the callback on each item. Otherwise call directly on item.
        if (null == item ) return item; // Skip null|undefined
        if (typeof item == 'object' && !item.nodeType && isNumber(item.length)) each(item, fn, scope);
        else fn.call(scope || item, item); 
        return item; // chainable
    }

    /**
     * @param {Function} fn gets a value to compare against
     * @return {Function} range comparison tester
     */        
    function ranger(fn) {
        /**
         * @param {string|number} min
         * @param {(string|number)=} max
         */
        return function(min, max) {
            var n = fn();
            min = n >= (min || 0);
            return max ? min && n <= max : min;        
        };
    }

    /** 
     * Range comparison booleans
     * @link responsejs.com/#booleans
     */
    band = ranger(viewportW);      // Response.band
    wave = ranger(viewportH);      // Response.wave
    device.band = ranger(deviceW); // Response.device.band
    device.wave = ranger(deviceH); // Response.device.wave
    
    /**
     * Response.dpr(decimal) Tests if a minimum device pixel ratio is active. 
     * Or (version added in 0.3.0) returns the device-pixel-ratio
     * @param {number} decimal   is the integer or float to test.
     * @return {boolean|number}
     * @example Response.dpr() // get the device-pixel-ratio (or 0 if undetectable)
     * @example Response.dpr(1.5) // true when device-pixel-ratio is 1.5+
     * @example Response.dpr(2) // true when device-pixel-ratio is 2+
     */
    function dpr(decimal) {
        // Consider: github.com/ryanve/res
        var dPR = win.devicePixelRatio;
        if (null == decimal) return dPR || (dpr(2) ? 2 : dpr(1.5) ? 1.5 : dpr(1) ? 1 : 0); // approx
        if (!isFinite(decimal)) return false;

        // Use window.devicePixelRatio if supported - supported by Webkit 
        // (Safari/Chrome/Android) and Presto 2.8+ (Opera) browsers.         
        if (dPR && dPR > 0) return dPR >= decimal; 

        // Fallback to .matchMedia/.msMatchMedia. Supported by Gecko (FF6+) and more:
        // @link developer.mozilla.org/en/DOM/window.matchMedia
        // -webkit-min- and -o-min- omitted (Webkit/Opera supported above)
        // The generic min-device-pixel-ratio is expected to be added to the W3 spec.
        // Return false if neither method is available.
        decimal = 'only all and (min--moz-device-pixel-ratio:' + decimal + ')';
        if (media(decimal).matches) return true;
        return !!media(decimal.replace('-moz-', '')).matches;
    }

    /**
     * Response.camelize
     * @example Response.camelize('data-casa-blanca') // casaBlanca
     */
    function camelize(s) {
        // Remove data- prefix and convert remaining dashed string to camelCase:
        return s.replace(regexDataPrefix, '$1').replace(regexDashB4, function(m, m1) {
            return m1.toUpperCase();
        });
    }

    /**
     * Response.datatize
     * Converts pulpFiction (or data-pulpFiction) to data-pulp-fiction
     * @example Response.datatize('casaBlanca')  // data-casa-blanca
     */
    function datatize(s) {
        // Make sure there's no data- already in s for it to work right in IE8.
        return 'data-' + (s ? s.replace(regexDataPrefix, '$1').replace(regexCamels, '$1-$2').toLowerCase() : s);
    }

    /**
     * Response.render
     * Converts stringified primitives back to JavaScript.
     * Adapted from dataValue() @link github.com/ded/bonzo
     * @since 0.3.0
     * @param {string|*} s String to render back to its correct JavaScript value.
     *   If s is not a string then it is returned unaffected. 
     * @return  converted data
     *
     */
    function render(s) {
        var n; // undefined
        return (!s || typeof s != 'string' ? s
            : 'true' === s      ? true        // convert "true" to true
            : 'false' === s     ? false       // convert "false" to false
            : 'undefined' === s ? n           // convert "undefined" to undefined
            : 'null' === s      ? null        // convert "null" to null
            : (n = parseFloat(s)) === +n ? n  // convert "1000" to 1000
            : s                               // unchanged
        );
    }
    
    // Isolate native element:
    function getNative(e) {
        // stackoverflow.com/questions/9119823/safest-way-to-detect-native-dom-element
        // See @link jsperf.com/get-native
        // If e is a native element then return it. If not check if index 0 exists and is
        // a native elem. If so then return that. Otherwise return false.
        return !e ? false : e.nodeType === 1 ? e : e[0] && e[0].nodeType === 1 ? e[0] : false;
    }

    function datasetChainable(key, value) {
        var n, numOfArgs = arguments.length, elem = getNative(this), ret = {}, renderData = false;

        if (numOfArgs) { 
            if (isArray(key)) {
                renderData = true;
                key = key[0];
            }
            if (typeof key === 'string') {
                key = datatize(key);
                if (1 === numOfArgs) {//GET
                    ret = elem.getAttribute(key);
                    return renderData ? render(ret) : ret;
                }
                if (this === elem || 2 > (n = this.length || 1)) elem.setAttribute(key, value);
                else while (n--) n in this && datasetChainable.apply(this[n], arguments);
            } else if (key instanceof Object) {
                for (n in key) {
                    key.hasOwnProperty(n) && datasetChainable.call(this, n, key[n]);
                }
            }
            return this;
        }

        // ** Zero args **
        // Get object containing all the data attributes. Use native dataset when avail.
        if (elem.dataset && DOMStringMap) return elem.dataset;
        each(elem.attributes, function(a) {
            // Fallback adapted from ded/bonzo
            a && (n = String(a.name).match(regexDataPrefix)) && (ret[camelize(n[1])] = a.value);
        });
        return ret; // plain object
    }

    function deletesChainable(keys) {
        if (this && typeof keys === 'string') {
            keys = ssvToArr(keys);
            route(this, function(el) {
                each(keys, function(key) {
                    if (key) {
                        el.removeAttribute(datatize(key));
                    }
                });
            });
        }
        return this;
    }

    /**
     * Response.dataset() See datasetChainable above
     * @since 0.3.0
     */
    function dataset(elem) {
        return datasetChainable.apply(elem, slice.call(arguments, 1));
    }

    /**
     * Response.deletes(elem, keys)  Delete HTML5 data attributes (remove them from them DOM)
     * @since 0.3.0
     * @param {Element|Object} elem is a native element or jQuery object
     * @param {string} keys  one or more space-separated data attribute keys (names) to delete (removed
     * from the DOM) Should be camelCased or lowercase.               // from all divs.
     */
    function deletes(elem, keys) {
        return deletesChainable.call(elem, keys);
    }
    
    function selectify(keys) {
        // Convert an array of data keys into a selector string
        // Converts ["a","b","c"] into "[data-a],[data-b],[data-c]"
        // Double-slash escapes periods so that attrs like data-density-1.5 will work
        // @link api.jquery.com/category/selectors/
        // @link github.com/jquery/sizzle/issues/76
        var k, r = [], i = 0, l = keys.length;
        while (i < l) {
            (k = keys[i++]) && r.push('[' + datatize(k.replace(regexTrimPunc, '').replace('.', '\\.')) + ']');
        }
        return r.join();
    }

    /**
     * Response.target() Get the corresponding data attributes for an array of data keys.
     * @since 0.1.9
     * @param {Array} keys is the array of data keys whose attributes you want to select.
     * @return {Object} jQuery stack
     * @example Response.target(['a', 'b', 'c']) //  $('[data-a],[data-b],[data-c]')
     * @example Response.target('a b c']) //  $('[data-a],[data-b],[data-c]')
     */
    function target(keys) {
        return $(selectify(ssvToArr(keys)));    
    }

    // Cross-browser versions of window.scrollX and window.scrollY
    // Compatibiliy notes @link developer.mozilla.org/en/DOM/window.scrollY
    // Performance tests @link jsperf.com/scrollx-cross-browser-compatible
    // Using native here b/c Zepto doesn't support .scrollLeft() /scrollTop()
    // In jQuery you can do $(window).scrollLeft() and $(window).scrollTop()

    /** 
     * @since 0.3.0
     * @return {number}
     */
    function scrollX() {
        return window.pageXOffset || docElem.scrollLeft; 
    }

    /** 
     * @since   0.3.0
     * @return {number}
     */
    function scrollY() { 
        return window.pageYOffset || docElem.scrollTop; 
    }

    /**
     * area methods inX/inY/inViewport
     * @since   0.3.0
     */
    function rectangle(el, verge) {
        // Local handler for area methods:
        // adapted from github.com/ryanve/dime
        // The native object is read-only so we 
        // have use a copy in order to modify it.
        var r = el.getBoundingClientRect ? el.getBoundingClientRect() : {};
        verge = typeof verge == 'number' ? verge || 0 : 0;
        return {
            top: (r.top || 0) - verge
          , left: (r.left || 0) - verge
          , bottom: (r.bottom || 0) + verge
          , right: (r.right || 0) + verge
        };
    }
         
    // The verge is the amount of pixels to act as a cushion around the viewport. It can be any 
    // integer. If verge is zero, then the inX/inY/inViewport methods are exact. If verge is set to 100, 
    // then those methods return true when for elements that are are in the viewport *or* near it, 
    // with *near* being defined as within 100 pixels outside the viewport edge. Elements immediately 
    // outside the viewport are 'on the verge' of being scrolled to.

    function inX(elem, verge) {
        var r = rectangle(getNative(elem), verge);
        return !!r && r.right >= 0 && r.left <= viewportW();
    }

    function inY(elem, verge) {
        var r = rectangle(getNative(elem), verge);
        return !!r && r.bottom >= 0 && r.top <= viewportH();
    }

    function inViewport(elem, verge) {
        // equiv to: inX(elem, verge) && inY(elem, verge)
        // But just manually do both to avoid calling rectangle() and getNative() twice.
        // It actually gzips smaller this way too:
        var r = rectangle(getNative(elem), verge);
        return !!r && r.bottom >= 0 && r.top <= viewportH() && r.right >= 0 && r.left <= viewportW();
    }
    
    /**
     * @description Detect whether elem should act in src or markup mode.
     * @param {Element} elem
     * @return {number}
     */
    function detectMode(elem) {
        // Normalize to lowercase to ensure compatibility across HTML/XHTML/XML.
        // These are the elems that can use src attr per the W3 spec:
        //dev.w3.org/html5/spec-author-view/index.html#attributes-1
        //stackoverflow.com/q/8715689/770127
        //stackoverflow.com/a/4878963/770127
        var srcElems = { img:1, input:1, source:3, embed:3, track:3, iframe:5, audio:5, video:5, script:5 }
          , modeID = srcElems[ elem.nodeName.toLowerCase() ] || -1;

        // -5 => markup mode for video/audio/iframe w/o src attr.
        // -1 => markup mode for any elem not in the array above.
        //  1 => src mode    for img/input (empty content model). Images.
        //  3 => src mode    for source/embed/track (empty content model). Media *or* time data.
        //  5 => src mode    for audio/video/iframe/script *with* src attr.
        //  If we at some point we need to differentiate <track> we'll use 4, but for now
        //  it's grouped with the other non-image empty content elems that use src.
        //  hasAttribute is not supported in IE7 so check elem.getAttribute('src')
        return 4 > modeID ? modeID : null != elem.getAttribute('src') ? 5 : -5;
    }

    /**
     * Response.store()
     * Store a data value on each elem targeted by a jQuery selector. We use this for storing an 
     * elem's orig (no-js) state. This gives us the ability to return the elem to its orig state.
     * The data it stores is either the src attr or the innerHTML based on result of detectMode().
     * @since 0.1.9
     * @param {Object} $elems DOM element | jQuery object | nodeList | array of elements
     * @param {string} key is the key to use to store the orig value w/ @link api.jquery.com/data/
     * @param {string=} source  (@since 0.6.2) an optional attribute name to read data from
     */
    function store($elems, key, source) {
        var valToStore;
        if (!$elems || null == key) doError('store');
        source = typeof source == 'string' && source;

        route($elems, function(el) {
            if ( source ) { valToStore = el.getAttribute(source); }
            else if ( 0 < detectMode(el) ) { valToStore = el.getAttribute('src'); }
            else { valToStore = el.innerHTML; }
            null == valToStore ? deletes(el, key) : dataset(el, key, valToStore); 
        });

        return Response;
    }

    /**
     * Response.access() Access data-* values for element from an array of data-* keys. 
     * @since 0.1.9 added support for space-separated strings in 0.3.1
     * @param {Object} elem is a native or jQuery element whose values to access.
     * @param {Array|string} keys is an array or SSV string of data keys
     * @return {Array} dataset values corresponding to each key. Since 0.4.0 if
     *   the params are wrong then the return is an empty array.
     */
    function access(elem, keys) {
        // elem becomes thisArg for datasetChainable:
        var ret = [];
        elem && keys && each(ssvToArr(keys), function(k) {
            ret.push(dataset(elem, k));
        }, elem);
        return ret;
    }

    function addTest(prop, fn) {
        if (typeof prop == 'string' && typeof fn == 'function') {
            propTests[prop] = fn;
            isCustom[prop] = 1;
        }
        return Response;
    }
        
    // Prototype object for element sets used in Response.create
    // Each element in the set inherits this as well, so some of the 
    // methods apply to the set, while others apply to single elements.
    Elemset = (function() {
        var crossover = event.crossover
          //, update = event.update
          , min = Math.min;

        // Techically data attributes names can contain uppercase in HTML, but, The DOM lowercases 
        // attributes, so they must be lowercase regardless when we target them in jQuery. Force them 
        // lowercase here to prevent issues. Removing all punc marks except for dashes, underscores,
        // and periods so that we don't have to worry about escaping anything crazy.
        // Rules @link dev.w3.org/html5/spec/Overview.html#custom-data-attribute
        // jQuery selectors @link api.jquery.com/category/selectors/ 
            
        function sanitize (key) {
            // Allow lowercase alphanumerics, dashes, underscores, and periods:
            return typeof key == 'string' ? key.toLowerCase().replace(regexFunkyPunc, '') : '';
        }

        return {
            $e: 0             // object   jQuery object
          , mode: 0           // integer  defined per element
          , breakpoints: null // array    validated @ configure()
          , prefix: null      // string   validated @ configure()
          , prop: 'width'     // string   validated @ configure()
          , keys: []          // array    defined @ configure()
          , dynamic: null     // boolean  defined @ configure()
          , custom: 0         // boolean  see addTest()
          , values: []        // array    available values
          , fn: 0             // callback the test fn, defined @ configure()
          , verge: null       // integer  uses default based on device size
          , newValue: 0
          , currValue: 1
          , aka: null
          , lazy: null
          , i: 0              // integer   the index of the current highest active breakpoint min
          , uid: null
          
            // Reset and fire crossover events.
          , reset: function() {
                var subjects = this.breakpoints
                  , i = subjects.length
                  , tempIndex = 0;
                  
                while (!tempIndex && i--) this.fn(subjects[i]) && (tempIndex = i);

                // Fire the crossover event if crossover has occured:
                if (tempIndex !== this.i) {
                    $win.trigger(crossover) // fires for each set
                        .trigger(this.prop + crossover); // fires 
                    this.i = tempIndex || 0;
                }
                return this;
            }

          , configure: function(options) {
                merge(this, options);
          
                var i, prefix, aliases, aliasKeys, isNumeric = true, arr, prop = this.prop;
                this.uid = suid++;
                if (null == this.verge) this.verge = min(screenMax, 500);
                this.fn = propTests[prop] || doError('create @fn');

                // If we get to here then we know the prop is one one our supported props:
                // 'width', 'height', 'device-width', 'device-height', 'device-pixel-ratio'
                // device- props => NOT dynamic
                if (typeof this.dynamic != 'boolean') {
                    this.dynamic = !!('device' !== prop.substring(0, 6));
                }
                
                this.custom = isCustom[prop];
                prefix = this.prefix ? sift(map(ssvToArr(this.prefix), sanitize)) : ['min-' + prop + '-'];
                aliases = 1 < prefix.length ? prefix.slice(1) : 0;
                this.prefix = prefix[0];
                arr = this.breakpoints;
                
                // Sort and validate (#valid8) custom breakpoints if supplied.
                // Must be done before keys are created so that the keys match:
                if (isArray(arr)) {// custom breakpoints
                            
                    each(arr, function(v) {
                        if (!v && v !== 0) throw 'invalid breakpoint';
                        isNumeric = isNumeric && isFinite(v);
                    });

                    arr = isNumeric ? arr.sort(function(a, b) {
                        return (a - b); // sort lowest to highest
                    }) : arr; 

                    arr.length || doError('create @breakpoints');
                    
                } else {// default breakpoints:
                    // The defaults are presorted so we can skip the need to sort when using the defaults. Omit
                    // trailing decimal zeros b/c for example if you put 1.0 as a devicePixelRatio breakpoint, 
                    // then the target would be data-pre1 (NOT data-pre1.0) so drop the zeros.
                    // If no breakpoints are supplied, then get the default breakpoints for the specified prop.
                    // Supported props: 'width', 'height', 'device-width', 'device-height', 'device-pixel-ratio'
                    arr = defaultBreakpoints[prop] || defaultBreakpoints[prop.split('-').pop()] || doError('create @prop'); 
                }

                // Remove breakpoints that are above the device's max dimension,
                // in order to reduce the number of iterations needed later.
                this.breakpoints = isNumeric ? sift(arr, function(n) { 
                    return n <= screenMax; 
                }) : arr;

                // Use the breakpoints array to create array of data keys:
                this.keys = affix(this.breakpoints, this.prefix);
                this.aka = null; // Reset to just in case a value was merged in.

                if (aliases) {// There may be one of more aliases:
                    aliasKeys = [];
                    i = aliases.length;
                    while (i--) aliasKeys.push(affix(this.breakpoints, aliases[i]));
                    this.aka = aliasKeys; // this.aka is an array of arrays (one for each alias)
                    this.keys = concat.apply(this.keys, aliasKeys); // flatten aliases into this.keys
                }

                sets.all = sets.all.concat(sets[this.uid] = this.keys); // combined keys ===> sets.all
                return this;
            }

          , target: function() {// Stuff that can't happen until the DOM is ready:
                this.$e = $(selectify(sets[this.uid])); // Cache jQuery object for the set.
                store(this.$e, initContentKey);  // Store original (no-js) value to data key.
                this.keys.push(initContentKey);  // Add key onto end of keys array. (# keys now equals # breakpoints + 1)
                return this; // chainable
            }

            // The rest of the methods are designed for use with single elements.
            // They are for use in a cloned instances within a loop.
          , decideValue: function() {
                // Return the first value from the values array that passes the boolean
                // test callback. If none pass the test, then return the fallback value.
                // this.breakpoints.length === this.values.length + 1  
                // The extra member in the values array is the initContentKey value.
                var val = null, subjects = this.breakpoints, sL = subjects.length, i = sL;
                while (val == null && i--) this.fn(subjects[i]) && (val = this.values[i]);
                this.newValue = typeof val === 'string' ? val : this.values[sL];
                return this; // chainable
            }

          , prepareData: function(elem) {
                this.$e = $(elem);
                this.mode = detectMode(elem);
                this.values = access(this.$e, this.keys);
                if (this.aka) {
                    // If there are alias keys then there may be alias values. Merge the values from 
                    // all the aliases into the values array. The merge method only merges in truthy values
                    // and prevents falsey values from overwriting truthy ones. (See Response.merge)
                    // Each of the this.aka arrays has the same length as the this.values
                    // array, so no new indexes will be added, just filled if there's truthy values.
                    var i = this.aka.length;
                    while (i--) this.values = merge(this.values, access(this.$e, this.aka[i]));
                }
                return this.decideValue();
            }

          , updateDOM: function() {
                // Apply the method that performs the actual swap. When updateDOM called this.$e and this.e refer
                // to single elements. Only update the DOM when the new value is different than the current value.
                if (this.currValue === this.newValue) { return this; }
                this.currValue = this.newValue;
                if (0 < this.mode) { 
                    this.$e[0].setAttribute('src', this.newValue); 
                } else if (null == this.newValue) { 
                    this.$e.empty && this.$e.empty(); 
                } else {
                    if (this.$e.html) {
                        this.$e.html(this.newValue); 
                    } else {
                        this.$e.empty && this.$e.empty();
                        this.$e[0].innerHTML = this.newValue;
                    }
                }
                // this.$e.trigger(update); // may add this event in future
                return this;
            }

        };
    }());
    
    // The keys are the prop and the values are the method that tests that prop.
    // The props with dashes in them are added via array notation below.
    // Props marked as dynamic change when the viewport is resized:
    propTests['width'] = band;   // dynamic
    propTests['height'] = wave;  // dynamic
    propTests['device-width'] = device.band;
    propTests['device-height'] = device.wave;
    propTests['device-pixel-ratio'] = dpr;

    function resize(fn) {
        $win.on('resize', fn);
        return Response; // chain
    }

    function crossover(prop, fn) {
        var temp, eventToFire, eventCrossover = event.crossover;
        if (typeof prop == 'function') {// support args in reverse
            temp = fn;
            fn = prop;
            prop = temp;
        }
        eventToFire = prop ? ('' + prop + eventCrossover) : eventCrossover;
        $win.on(eventToFire, fn);
        return Response; // chain
    }

    /**
     * Response.action A facade for calling functions on both the ready and resize events.
     * @link http://responsejs.com/#action
     * @since 0.1.3
     * @param {Function|Array} action is the callback name or array of callback names to call.
     * @example Response.action(myFunc1) // call myFunc1() on ready/resize
     * @example Response.action([myFunc1, myFunc2]) // call myFunc1(), myFunc2() ...
     */
    function action(fnOrArr) {
        route(fnOrArr, function(fn) {
            ready(fn);
            resize(fn);
        });
        return Response;
    }
    
    /**
     * Response.create()  Create their own Response attribute sets, with custom 
     *   breakpoints and data-* names.
     * @since 0.1.9
     * @param {Object|Array} args is an options object or an array of options objects.
     * @link http://responsejs.com/#create
     * @example Response.create(object) // single
     * @example Response.create([object1, object2]) // bulk
     */

    function create(args) {
        route(args, function(options) {
            typeof options == 'object' || doError('create @args');
            
            var elemset = objectCreate(Elemset).configure(options)
              , lowestNonZeroBP
              , verge = elemset.verge
              , breakpoints = elemset.breakpoints
              , scrollName = namespaceIt('scroll')
              , resizeName = namespaceIt('resize');

            if (!breakpoints.length) return;

            // Identify the lowest nonzero breakpoint. (They're already sorted low to high by now.)
            lowestNonZeroBP = breakpoints[0] || breakpoints[1] || false;
        
            ready(function() {
                var allLoaded = event.allLoaded, lazy = !!elemset.lazy;

                // Target elements containing this set's Response data attributes and chain into the 
                // loop that occurs on ready. The selector is cached to elemset.$e for later use.
                each(elemset.target().$e, function(el, i) {
                    elemset[i] = objectCreate(elemset).prepareData(el);// Inherit from elemset
                    if (!lazy || inViewport(elemset[i].$e, verge)) {
                        // If not lazy update all the elems in the set. If
                        // lazy, only update elems in the current viewport.
                        elemset[i].updateDOM(); 
                    }
                });

                function resizeHandler() {   // Only runs for dynamic props.
                    elemset.reset();
                    each(elemset.$e, function(el, i) {// Reset and then loop thru the set.
                        elemset[i].decideValue().updateDOM(); // Grab elem object from cache and update all.
                    }).trigger(allLoaded);
                }

                // device-* props are static and only need to be tested once. The others are
                // dynamic, meaning they need to be tested on resize. Also if a device so small
                // that it doesn't support the lowestNonZeroBP then we don't need to listen for 
                // resize events b/c we know the device can't resize beyond that breakpoint.

                if (elemset.dynamic && (elemset.custom || lowestNonZeroBP < screenMax)) {
                   resize(resizeHandler, resizeName);
                }

                // We don't have to re-decide the content on scrolls because neither the viewport or device
                // properties change from a scroll. This setup minimizes the operations binded to the scroll 
                // event. Once everything in the set has been swapped once, the scroll handler is deactivated
                // through the use of a custom event.
                if (!lazy) return;

                function scrollHandler() {
                    each(elemset.$e, function(el, i) {
                        if (inViewport(elemset[i].$e, verge)) {
                            elemset[i].updateDOM();
                        }
                    });
                }

                $win.on(scrollName, scrollHandler);
                elemset.$e.one(allLoaded, function() {
                    $win.off(scrollName, scrollHandler);
                });

            });
        });
        return Response;
    }
    
    function noConflict(callback) {
        if (root[name] === Response) root[name] = old;
        if (typeof callback == 'function') callback.call(root, Response);
        return Response;
    }

    // Handler for adding inx/inY/inViewport to $.fn (or another prototype).
    function exposeAreaFilters(engine, proto, force) {
        each(['inX', 'inY', 'inViewport'], function(methodName) {
            (force || !proto[methodName]) && (proto[methodName] = function(verge, invert) {
                return engine(sift(this, function(el) {
                    return !!el && !invert === Response[methodName](el, verge); 
                }));
            });
        });
    }

    /**
     * Response.bridge
     * Bridges applicable methods into the specified host (e.g. jQuery)
     * @param {Function} host
     * @param {boolean=} force
     */
    function bridge(host, force) {
        if (typeof host == 'function' && host.fn) {
            // Expose .dataset() and .deletes() to jQuery:
            if (force || void 0 === host.fn.dataset) host.fn.dataset = datasetChainable; 
            if (force || void 0 === host.fn.deletes) host.fn.deletes = deletesChainable;
            // Expose .inX() .inY() .inViewport()
            exposeAreaFilters(host, host.fn, force);
        }
        return Response;
    }
    
    /**
     * Response.chain
     * @since 0.3.0
     * @deprecated Use Response.bridge instead.
     */
    function chain (host, force) {
        host = arguments.length ? host : $;
        return bridge(host, force);
    }
    
    Response = {
        deviceMin: function() { return screenMin; }
      , deviceMax: function() { return screenMax; }
      //, sets: function(prop) {// must be uid
      //    return $(selectify(sets[prop] || sets.all));
      //}
      , noConflict: noConflict
      , chain: chain
      , bridge: bridge
      , create: create
      , addTest: addTest
      , datatize: datatize
      , camelize: camelize
      , render: render
      , store: store
      , access: access
      , target: target
      , object: objectCreate
      , crossover: crossover
      , action: action
      , resize: resize
      , ready: ready
      , affix: affix
      , sift: sift
      , dpr: dpr
      , deletes: deletes
      , scrollX: scrollX
      , scrollY: scrollY
      , deviceW: deviceW
      , deviceH: deviceH
      , device: device
      , inX: inX
      , inY: inY
      , route: route
      , merge: merge
      , media: media
      , wave: wave
      , band: band
      , map: map
      , each: each
      , inViewport: inViewport
      , dataset: dataset
      , viewportH: viewportH
      , viewportW: viewportW
    };

    // Initialize
    ready(function() {
        var nativeJSONParse, customData = dataset(doc.body, 'responsejs');
        if (customData) {
            nativeJSONParse = !!win.JSON && JSON.parse;
            if (nativeJSONParse) customData = nativeJSONParse(customData); 
            else if ($.parseJSON) customData = $.parseJSON(customData); 
            customData && customData.create && create(customData.create);
        }
        // Remove .no-responsejs class from html tag (if it's there) and add .responsejs
        docElem.className = docElem.className.replace(/(^|\s)(no-)?responsejs(\s|$)/, '$1$3') + ' responsejs ';
    });

    return Response;
}));