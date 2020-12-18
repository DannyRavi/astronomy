/**
    @preserve

    Astronomy library for JavaScript (browser and Node.js).
    https://github.com/cosinekitty/astronomy

    MIT License

    Copyright (c) 2019-2020 Don Cross <cosinekitty@gmail.com>

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

/**
 * @fileoverview Astronomy calculation library for browser scripting and Node.js.
 *
 * @author Don Cross <cosinekitty@gmail.com>
 * @license MIT
 */
'use strict';

/**
 * @name Astronomy
 * @namespace Astronomy
 */
(function(Astronomy){
'use strict';
const DAYS_PER_TROPICAL_YEAR = 365.24217;
const J2000 = new Date('2000-01-01T12:00:00Z');
const PI2 = 2 * Math.PI;
const ARC = 3600 * (180 / Math.PI);     // arcseconds per radian
const KM_PER_AU = 1.4959787069098932e+8;
const C_AUDAY = 173.1446326846693;      // speed of light in AU/day
const ASEC2RAD = 4.848136811095359935899141e-6;
const DEG2RAD = 0.017453292519943296;
const RAD2DEG = 57.295779513082321;
const ASEC180 = 180 * 60 * 60;              // arcseconds per 180 degrees (or pi radians)
const ASEC360 = 2 * ASEC180;                // arcseconds per 360 degrees (or 2*pi radians)
const ANGVEL = 7.2921150e-5;
const AU_PER_PARSEC = ASEC180 / Math.PI;    // exact definition of how many AU = one parsec
const SUN_MAG_1AU = -0.17 - 5*Math.log10(AU_PER_PARSEC);    // formula from JPL Horizons
const MEAN_SYNODIC_MONTH = 29.530588;       // average number of days for Moon to return to the same phase
const SECONDS_PER_DAY = 24 * 3600;
const MILLIS_PER_DAY = SECONDS_PER_DAY * 1000;
const SOLAR_DAYS_PER_SIDEREAL_DAY = 0.9972695717592592;

const SUN_RADIUS_KM = 695700.0;
const SUN_RADIUS_AU  = SUN_RADIUS_KM / KM_PER_AU;

const EARTH_FLATTENING = 0.996647180302104;
const EARTH_EQUATORIAL_RADIUS_KM = 6378.1366;
const EARTH_EQUATORIAL_RADIUS_AU = EARTH_EQUATORIAL_RADIUS_KM / KM_PER_AU;
const EARTH_MEAN_RADIUS_KM = 6371.0;    /* mean radius of the Earth's geoid, without atmosphere */
const EARTH_ATMOSPHERE_KM = 88.0;       /* effective atmosphere thickness for lunar eclipses */
const EARTH_ECLIPSE_RADIUS_KM = EARTH_MEAN_RADIUS_KM + EARTH_ATMOSPHERE_KM;

const MOON_EQUATORIAL_RADIUS_KM = 1738.1;
const MOON_MEAN_RADIUS_KM       = 1737.4;
const MOON_POLAR_RADIUS_KM      = 1736.0;
const MOON_EQUATORIAL_RADIUS_AU = (MOON_EQUATORIAL_RADIUS_KM / KM_PER_AU);

const REFRACTION_NEAR_HORIZON = 34 / 60;        // degrees of refractive "lift" seen for objects near horizon
const EARTH_MOON_MASS_RATIO = 81.30056;

/*
    Masses of the Sun and outer planets, used for:
    (1) Calculating the Solar System Barycenter
    (2) Integrating the movement of Pluto

    https://web.archive.org/web/20120220062549/http://iau-comm4.jpl.nasa.gov/de405iom/de405iom.pdf

    Page 10 in the above document describes the constants used in the DE405 ephemeris.
    The following are G*M values (gravity constant * mass) in [au^3 / day^2].
    This side-steps issues of not knowing the exact values of G and masses M[i];
    the products GM[i] are known extremely accurately.
*/
const SUN_GM     = 0.2959122082855911e-03;
const JUPITER_GM = 0.2825345909524226e-06;
const SATURN_GM  = 0.8459715185680659e-07;
const URANUS_GM  = 0.1292024916781969e-07;
const NEPTUNE_GM = 0.1524358900784276e-07;

let ob2000;   // lazy-evaluated mean obliquity of the ecliptic at J2000, in radians
let cos_ob2000;
let sin_ob2000;

function VerifyBoolean(b) {
    if (b !== true && b !== false) {
        console.trace();
        throw `Value is not boolean: ${b}`;
    }
    return b;
}

function VerifyNumber(x) {
    if (!Number.isFinite(x)) {
        console.trace();
        throw `Value is not a finite number: ${x}`;
    }
    return x;
}

function IsValidDate(d) {
    return (d instanceof Date) && Number.isFinite(d.getTime());
}

function Frac(x) {
    return x - Math.floor(x);
}

/**
 * Calculates the angle in degrees between two vectors.
 * The angle is measured in the plane that contains both vectors.
 *
 * @param {Astronomy.Vector} a
 *      The first of a pair of vectors between which to measure an angle.
 *
 * @param {Astronomy.Vector} b
 *      The second of a pair of vectors between which to measure an angle.
 *
 * @returns {number}
 *      The angle between the two vectors expressed in degrees.
 *      The value is in the range [0, 180].
 */
function AngleBetween(a, b) {
    const aa = (a.x*a.x + a.y*a.y + a.z*a.z);
    if (Math.abs(aa) < 1.0e-8)
        throw `AngleBetween: first vector is too short.`;

    const bb = (b.x*b.x + b.y*b.y + b.z*b.z);
    if (Math.abs(bb) < 1.0e-8)
        throw `AngleBetween: second vector is too short.`;

    const dot = (a.x*b.x + a.y*b.y + a.z*b.z) / Math.sqrt(aa * bb);

    if (dot <= -1.0)
        return 180;

    if (dot >= +1.0)
        return 0;

    const angle = RAD2DEG * Math.acos(dot);
    return angle;
}

/**
 * @constant {string[]} Astronomy.Bodies
 *      An array of strings, each a name of a supported astronomical body.
 *      Not all bodies are valid for all functions, but any string not in this
 *      list is not supported at all.
 */
Astronomy.Bodies = [
    'Sun',
    'Moon',
    'Mercury',
    'Venus',
    'Earth',
    'Mars',
    'Jupiter',
    'Saturn',
    'Uranus',
    'Neptune',
    'Pluto',
    'SSB',          // Solar System Barycenter
    'EMB'           // Earth/Moon Barycenter
];

const Planet = {
    Mercury: { OrbitalPeriod:    87.969 },
    Venus:   { OrbitalPeriod:   224.701 },
    Earth:   { OrbitalPeriod:   365.256 },
    Mars:    { OrbitalPeriod:   686.980 },
    Jupiter: { OrbitalPeriod:  4332.589 },
    Saturn:  { OrbitalPeriod: 10759.22  },
    Uranus:  { OrbitalPeriod: 30685.4   },
    Neptune: { OrbitalPeriod: 60189.0   },
    Pluto:   { OrbitalPeriod: 90560.0   }
};

const vsop = {
    Mercury: $ASTRO_LIST_VSOP(Mercury),
    Venus:   $ASTRO_LIST_VSOP(Venus),
    Earth:   $ASTRO_LIST_VSOP(Earth),
    Mars:    $ASTRO_LIST_VSOP(Mars),
    Jupiter: $ASTRO_LIST_VSOP(Jupiter),
    Saturn:  $ASTRO_LIST_VSOP(Saturn),
    Uranus:  $ASTRO_LIST_VSOP(Uranus),
    Neptune: $ASTRO_LIST_VSOP(Neptune)
};

Astronomy.DeltaT_EspenakMeeus = function(ut) {
    var u, u2, u3, u4, u5, u6, u7;

    /*
        Fred Espenak writes about Delta-T generically here:
        https://eclipse.gsfc.nasa.gov/SEhelp/deltaT.html
        https://eclipse.gsfc.nasa.gov/SEhelp/deltat2004.html

        He provides polynomial approximations for distant years here:
        https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html

        They start with a year value 'y' such that y=2000 corresponds
        to the UTC Date 15-January-2000. Convert difference in days
        to mean tropical years.
    */

    const y = 2000 + ((ut - 14) / DAYS_PER_TROPICAL_YEAR);

    if (y < -500) {
        u = (y - 1820) / 100;
        return -20 + (32 * u*u);
    }
    if (y < 500) {
        u = y / 100;
        u2 = u*u; u3 = u*u2; u4 = u2*u2; u5 = u2*u3; u6 = u3*u3;
        return 10583.6 - 1014.41*u + 33.78311*u2 - 5.952053*u3 - 0.1798452*u4 + 0.022174192*u5 + 0.0090316521*u6;
    }
    if (y < 1600) {
        u = (y - 1000) / 100;
        u2 = u*u; u3 = u*u2; u4 = u2*u2; u5 = u2*u3; u6 = u3*u3;
        return 1574.2 - 556.01*u + 71.23472*u2 + 0.319781*u3 - 0.8503463*u4 - 0.005050998*u5 + 0.0083572073*u6;
    }
    if (y < 1700) {
        u = y - 1600;
        u2 = u*u; u3 = u*u2;
        return 120 - 0.9808*u - 0.01532*u2 + u3/7129.0;
    }
    if (y < 1800) {
        u = y - 1700;
        u2 = u*u; u3 = u*u2; u4 = u2*u2;
        return 8.83 + 0.1603*u - 0.0059285*u2 + 0.00013336*u3 - u4/1174000;
    }
    if (y < 1860) {
        u = y - 1800;
        u2 = u*u; u3 = u*u2; u4 = u2*u2; u5 = u2*u3; u6 = u3*u3; u7 = u3*u4;
        return 13.72 - 0.332447*u + 0.0068612*u2 + 0.0041116*u3 - 0.00037436*u4 + 0.0000121272*u5 - 0.0000001699*u6 + 0.000000000875*u7;
    }
    if (y < 1900) {
        u = y - 1860;
        u2 = u*u; u3 = u*u2; u4 = u2*u2; u5 = u2*u3;
        return 7.62 + 0.5737*u - 0.251754*u2 + 0.01680668*u3 - 0.0004473624*u4 + u5/233174;
    }
    if (y < 1920) {
        u = y - 1900;
        u2 = u*u; u3 = u*u2; u4 = u2*u2;
        return -2.79 + 1.494119*u - 0.0598939*u2 + 0.0061966*u3 - 0.000197*u4;
    }
    if (y < 1941) {
        u = y - 1920;
        u2 = u*u; u3 = u*u2;
        return 21.20 + 0.84493*u - 0.076100*u2 + 0.0020936*u3;
    }
    if (y < 1961) {
        u = y - 1950;
        u2 = u*u; u3 = u*u2;
        return 29.07 + 0.407*u - u2/233 + u3/2547;
    }
    if (y < 1986) {
        u = y - 1975;
        u2 = u*u; u3 = u*u2;
        return 45.45 + 1.067*u - u2/260 - u3/718;
    }
    if (y < 2005) {
        u = y - 2000;
        u2 = u*u; u3 = u*u2; u4 = u2*u2; u5 = u2*u3;
        return 63.86 + 0.3345*u - 0.060374*u2 + 0.0017275*u3 + 0.000651814*u4 + 0.00002373599*u5;
    }
    if (y < 2050) {
        u = y - 2000;
        return 62.92 + 0.32217*u + 0.005589*u*u;
    }
    if (y < 2150) {
        u = (y-1820)/100;
        return -20 + 32*u*u - 0.5628*(2150 - y);
    }

    /* all years after 2150 */
    u = (y - 1820) / 100;
    return -20 + (32 * u*u);
}


Astronomy.DeltaT_JplHorizons = function(ut) {
    return Astronomy.DeltaT_EspenakMeeus(Math.min(ut, 17.0 * DAYS_PER_TROPICAL_YEAR));
}

var DeltaT = Astronomy.DeltaT_EspenakMeeus;

Astronomy.SetDeltaTFunction = function(func) {
    DeltaT = func;
}

/**
 * Calculates Terrestrial Time (TT) from Universal Time (UT).
 *
 * @param {number} ut
 *      The Universal Time expressed as a floating point number of days since the 2000.0 epoch.
 *
 * @returns {number}
 *      A Terrestrial Time expressed as a floating point number of days since the 2000.0 epoch.
 */
function TerrestrialTime(ut) {
    return ut + DeltaT(ut)/86400;
}

/**
 * @brief The date and time of an astronomical observation.
 *
 * Objects of this type are used throughout the internals
 * of the Astronomy library, and are included in certain return objects.
 * The constructor is not accessible outside the Astronomy library;
 * outside users should call the {@link Astronomy.MakeTime} function
 * to create an `AstroTime` object.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {Date} date
 *      The JavaScript Date object for the given date and time.
 *      This Date corresponds to the numeric day value stored in the `ut` property.
 *
 * @property {number} ut
 *      Universal Time (UT1/UTC) in fractional days since the J2000 epoch.
 *      Universal Time represents time measured with respect to the Earth's rotation,
 *      tracking mean solar days.
 *      The Astronomy library approximates UT1 and UTC as being the same thing.
 *      This gives sufficient accuracy for the precision requirements of this project.
 *
 * @property {number} tt
 *      Terrestrial Time in fractional days since the J2000 epoch.
 *      TT represents a continuously flowing ephemeris timescale independent of
 *      any variations of the Earth's rotation, and is adjusted from UT
 *      using historical and predictive models of those variations.
 */
class AstroTime {
    /**
     * @param {(Date|number)} date
     *      A JavaScript Date object or a numeric UTC value expressed in J2000 days.
     */
    constructor(date) {
        const MillisPerDay = 1000 * 3600 * 24;

        if (IsValidDate(date)) {
            this.date = date;
            this.ut = (date - J2000) / MillisPerDay;
            this.tt = TerrestrialTime(this.ut);
            return;
        }

        if (Number.isFinite(date)) {
            this.date = new Date(J2000 - (-date)*MillisPerDay);
            this.ut = date;
            this.tt = TerrestrialTime(this.ut);
            return;
        }

        throw 'Argument must be a Date object, an AstroTime object, or a numeric UTC Julian date.';
    }

    /**
     * Formats an `AstroTime` object as an [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601)
     * date/time string in UTC, to millisecond resolution.
     * Example: `2018-08-17T17:22:04.050Z`
     * @returns {string}
     */
    toString() {
        return this.date.toISOString();
    }

    /**
     * Returns a new `AstroTime` object adjusted by the floating point number of days.
     * Does NOT modify the original `AstroTime` object.
     *
     * @param {number} days
     *      The floating point number of days by which to adjust the given date and time.
     *      Positive values adjust the date toward the future, and
     *      negative values adjust the date toward the past.
     *
     * @returns {Astronomy.AstroTime}
     */
    AddDays(days) {
        // This is slightly wrong, but the error is tiny.
        // We really should be adding to TT, not to UT.
        // But using TT would require creating an inverse function for DeltaT,
        // which would be quite a bit of extra calculation.
        // I estimate the error is in practice on the order of 10^(-7)
        // times the value of 'days'.
        // This is based on a typical drift of 1 second per year between UT and TT.
        return new AstroTime(this.ut + days);
    }
}

function InterpolateTime(time1, time2, fraction) {
    return new AstroTime(time1.ut + fraction*(time2.ut - time1.ut));
}

/**
 * Given a Date object or a number days since noon (12:00) on January 1, 2000 (UTC),
 * this function creates an {@link Astronomy.AstroTime} object.
 * Given an {@link Astronomy.AstroTime} object, returns the same object unmodified.
 * Use of this function is not required for any of the other exposed functions in this library,
 * because they all guarantee converting date/time parameters to Astronomy.AstroTime
 * as needed. However, it may be convenient for callers who need to understand
 * the difference between UTC and TT (Terrestrial Time). In some use cases,
 * converting once to Astronomy.AstroTime format and passing the result into multiple
 * function calls may be more efficient than passing in native JavaScript Date objects.
 *
 * @param {(Date | number | Astronomy.AstroTime)} date
 *      A Date object, a number of UTC days since the J2000 epoch (noon on January 1, 2000),
 *      or an Astronomy.AstroTime object. See remarks above.
 *
 * @returns {Astronomy.AstroTime}
 */
Astronomy.MakeTime = function(date) {
    if (date instanceof AstroTime) {
        return date;
    }
    return new AstroTime(date);
}

const iaudata = [
$ASTRO_IAU_DATA()
];

function iau2000b(time) {
    var i, t, el, elp, f, d, om, arg, dp, de, sarg, carg;
    var nals, cls;

    function mod(x) {
        return (x % ASEC360) * ASEC2RAD;
    }

    t = time.tt / 36525;
    el  = mod(485868.249036 + t*1717915923.2178);
    elp = mod(1287104.79305 + t*129596581.0481);
    f   = mod(335779.526232 + t*1739527262.8478);
    d   = mod(1072260.70369 + t*1602961601.2090);
    om  = mod(450160.398036 - t*6962890.5431);
    dp = 0;
    de = 0;
    for (i=76; i >= 0; --i) {
        nals = iaudata[i].nals;
        cls = iaudata[i].cls;
        arg = (nals[0]*el + nals[1]*elp + nals[2]*f + nals[3]*d + nals[4]*om) % PI2;
        sarg = Math.sin(arg);
        carg = Math.cos(arg);
        dp += (cls[0] + cls[1]*t) * sarg + cls[2]*carg;
        de += (cls[3] + cls[4]*t) * carg + cls[5]*sarg;
    }
    return {
        dpsi: (-0.000135 * ASEC2RAD) + (dp * 1.0e-7 * ASEC2RAD),
        deps: (+0.000388 * ASEC2RAD) + (de * 1.0e-7 * ASEC2RAD)
    };
 }

function nutation_angles(time) {
    var nut = iau2000b(time);
    return { dpsi: nut.dpsi/ASEC2RAD, deps: nut.deps/ASEC2RAD };
}

function mean_obliq(time) {
    var t = time.tt / 36525;
    var asec = (
        (((( -  0.0000000434   * t
             -  0.000000576  ) * t
             +  0.00200340   ) * t
             -  0.0001831    ) * t
             - 46.836769     ) * t + 84381.406
    );
    return asec / 3600.0;
}

var cache_e_tilt;

function e_tilt(time) {
    if (!cache_e_tilt || Math.abs(cache_e_tilt.tt - time.tt) > 1.0e-6) {
        const nut = nutation_angles(time);
        const mean_ob = mean_obliq(time);
        const true_ob = mean_ob + (nut.deps / 3600);
        cache_e_tilt = {
            tt: time.tt,
            dpsi: nut.dpsi,
            deps: nut.deps,
            ee: nut.dpsi * Math.cos(mean_ob * DEG2RAD) / 15,
            mobl: mean_ob,
            tobl: true_ob
        };
    }
    return cache_e_tilt;
}

function ecl2equ_vec(time, pos) {
    var obl = mean_obliq(time) * DEG2RAD;
    var cos_obl = Math.cos(obl);
    var sin_obl = Math.sin(obl);
    return [
        pos[0],
        pos[1]*cos_obl - pos[2]*sin_obl,
        pos[1]*sin_obl + pos[2]*cos_obl
    ];
}

Astronomy.CalcMoonCount = 0;

function CalcMoon(time) {
    ++Astronomy.CalcMoonCount;

    const T = time.tt / 36525;

    function DeclareArray1(xmin, xmax) {
        var array = [];
        var i;
        for (i=0; i <= xmax-xmin; ++i) {
            array.push(0);
        }
        return {min:xmin, array:array};
    }

    function DeclareArray2(xmin, xmax, ymin, ymax) {
        var array = [];
        var i;
        for (i=0; i <= xmax-xmin; ++i) {
            array.push(DeclareArray1(ymin, ymax));
        }
        return {min:xmin, array:array};
    }

    function ArrayGet2(a, x, y) {
        var m = a.array[x - a.min];
        return m.array[y - m.min];
    }

    function ArraySet2(a, x, y, v) {
        var m = a.array[x - a.min];
        m.array[y - m.min] = v;
    }

    var S, MAX, ARG, FAC, I, J, T2, DGAM, DLAM, N, GAM1C, SINPI, L0, L, LS, F, D, DL0, DL, DLS, DF, DD, DS;
    var coArray = DeclareArray2(-6, 6, 1, 4);
    var siArray = DeclareArray2(-6, 6, 1, 4);

    function CO(x, y) {
        return ArrayGet2(coArray, x, y);
    }

    function SI(x, y) {
        return ArrayGet2(siArray, x, y);
    }

    function SetCO(x, y, v) {
        return ArraySet2(coArray, x, y, v);
    }

    function SetSI(x, y, v) {
        return ArraySet2(siArray, x, y, v);
    }

    function AddThe(c1, s1, c2, s2, func) {
        return func(c1*c2 - s1*s2, s1*c2 + c1*s2);
    }

    function Sine(phi) {
        return Math.sin(PI2 * phi);
    }

    T2 = T*T;
    DLAM = 0;
    DS = 0;
    GAM1C = 0;
    SINPI = 3422.7000;

    var S1 = Sine(0.19833+0.05611*T);
    var S2 = Sine(0.27869+0.04508*T);
    var S3 = Sine(0.16827-0.36903*T);
    var S4 = Sine(0.34734-5.37261*T);
    var S5 = Sine(0.10498-5.37899*T);
    var S6 = Sine(0.42681-0.41855*T);
    var S7 = Sine(0.14943-5.37511*T);
    DL0 = 0.84*S1+0.31*S2+14.27*S3+ 7.26*S4+ 0.28*S5+0.24*S6;
    DL  = 2.94*S1+0.31*S2+14.27*S3+ 9.34*S4+ 1.12*S5+0.83*S6;
    DLS =-6.40*S1                                   -1.89*S6;
    DF  = 0.21*S1+0.31*S2+14.27*S3-88.70*S4-15.30*S5+0.24*S6-1.86*S7;
    DD  = DL0-DLS;
    DGAM  = (-3332E-9 * Sine(0.59734-5.37261*T)
              -539E-9 * Sine(0.35498-5.37899*T)
               -64E-9 * Sine(0.39943-5.37511*T));

    L0 = PI2*Frac(0.60643382+1336.85522467*T-0.00000313*T2) + DL0/ARC;
    L  = PI2*Frac(0.37489701+1325.55240982*T+0.00002565*T2) + DL /ARC;
    LS = PI2*Frac(0.99312619+  99.99735956*T-0.00000044*T2) + DLS/ARC;
    F  = PI2*Frac(0.25909118+1342.22782980*T-0.00000892*T2) + DF /ARC;
    D  = PI2*Frac(0.82736186+1236.85308708*T-0.00000397*T2) + DD /ARC;
    for (I=1; I<=4; ++I)
    {
        switch (I)
        {
            case 1: ARG=L;  MAX=4; FAC=1.000002208;               break;
            case 2: ARG=LS; MAX=3; FAC=0.997504612-0.002495388*T; break;
            case 3: ARG=F;  MAX=4; FAC=1.000002708+139.978*DGAM;  break;
            case 4: ARG=D;  MAX=6; FAC=1.0;                       break;
        }
        SetCO(0, I, 1);
        SetCO(1, I, Math.cos(ARG) * FAC);
        SetSI(0, I, 0);
        SetSI(1, I, Math.sin(ARG) * FAC);
        for (J=2; J<=MAX; ++J) {
            AddThe(CO(J-1,I), SI(J-1,I), CO(1,I), SI(1,I), (c, s) => (SetCO(J,I,c), SetSI(J,I,s)));
        }
        for (J=1; J<=MAX; ++J) {
            SetCO(-J, I, CO(J, I));
            SetSI(-J, I, -SI(J, I));
        }
    }

    function Term(p, q, r, s) {
        var result = { x:1, y:0 };
        var I = [ null, p, q, r, s ];
        for (var k=1; k <= 4; ++k)
            if (I[k] !== 0)
                AddThe(result.x, result.y, CO(I[k], k), SI(I[k], k), (c, s) => (result.x=c, result.y=s));
        return result;
    }

    function AddSol(coeffl, coeffs, coeffg, coeffp, p, q, r, s) {
        var result = Term(p, q, r, s);
        DLAM += coeffl * result.y;
        DS += coeffs * result.y;
        GAM1C += coeffg * result.x;
        SINPI += coeffp * result.x;
    }

$ASTRO_ADDSOL()

    function ADDN(coeffn, p, q, r, s) {
        return coeffn * Term(p, q, r, s).y;
    }

    N = 0;
    N += ADDN(-526.069, 0, 0,1,-2);
    N += ADDN(  -3.352, 0, 0,1,-4);
    N += ADDN( +44.297,+1, 0,1,-2);
    N += ADDN(  -6.000,+1, 0,1,-4);
    N += ADDN( +20.599,-1, 0,1, 0);
    N += ADDN( -30.598,-1, 0,1,-2);
    N += ADDN( -24.649,-2, 0,1, 0);
    N += ADDN(  -2.000,-2, 0,1,-2);
    N += ADDN( -22.571, 0,+1,1,-2);
    N += ADDN( +10.985, 0,-1,1,-2);

    DLAM += (
        +0.82*Sine(0.7736  -62.5512*T)+0.31*Sine(0.0466 -125.1025*T)
        +0.35*Sine(0.5785  -25.1042*T)+0.66*Sine(0.4591+1335.8075*T)
        +0.64*Sine(0.3130  -91.5680*T)+1.14*Sine(0.1480+1331.2898*T)
        +0.21*Sine(0.5918+1056.5859*T)+0.44*Sine(0.5784+1322.8595*T)
        +0.24*Sine(0.2275   -5.7374*T)+0.28*Sine(0.2965   +2.6929*T)
        +0.33*Sine(0.3132   +6.3368*T)
    );

    S = F + DS/ARC;

    var lat_seconds = (1.000002708 + 139.978*DGAM)*(18518.511+1.189+GAM1C)*Math.sin(S) - 6.24*Math.sin(3*S) + N;

    return {
        geo_eclip_lon: PI2 * Frac((L0+DLAM/ARC) / PI2),
        geo_eclip_lat: (Math.PI / (180 * 3600)) * lat_seconds,
        distance_au: (ARC * EARTH_EQUATORIAL_RADIUS_AU) / (0.999953253 * SINPI)
    };
}

function precession(tt1, pos1, tt2) {
    const r = precession_rot(tt1, tt2);
    return [
        r.rot[0][0]*pos1[0] + r.rot[1][0]*pos1[1] + r.rot[2][0]*pos1[2],
        r.rot[0][1]*pos1[0] + r.rot[1][1]*pos1[1] + r.rot[2][1]*pos1[2],
        r.rot[0][2]*pos1[0] + r.rot[1][2]*pos1[1] + r.rot[2][2]*pos1[2]
    ];
}

function precession_rot(tt1, tt2) {
    var xx, yx, zx, xy, yy, zy, xz, yz, zz;
    var eps0 = 84381.406;
    var t, psia, omegaa, chia, sa, ca, sb, cb, sc, cc, sd, cd;

    if ((tt1 !== 0) && (tt2 !== 0))
        throw 'One of (tt1, tt2) must be 0.';

    t = (tt2 - tt1) / 36525;
    if (tt2 === 0)
        t = -t;

    psia   = (((((-    0.0000000951  * t
                 +    0.000132851 ) * t
                 -    0.00114045  ) * t
                 -    1.0790069   ) * t
                 + 5038.481507    ) * t);

    omegaa = (((((+    0.0000003337  * t
                 -    0.000000467 ) * t
                 -    0.00772503  ) * t
                 +    0.0512623   ) * t
                 -    0.025754    ) * t + eps0);

    chia   = (((((-    0.0000000560  * t
                 +    0.000170663 ) * t
                 -    0.00121197  ) * t
                 -    2.3814292   ) * t
                 +   10.556403    ) * t);

    eps0 = eps0 * ASEC2RAD;
    psia = psia * ASEC2RAD;
    omegaa = omegaa * ASEC2RAD;
    chia = chia * ASEC2RAD;

    sa = Math.sin(eps0);
    ca = Math.cos(eps0);
    sb = Math.sin(-psia);
    cb = Math.cos(-psia);
    sc = Math.sin(-omegaa);
    cc = Math.cos(-omegaa);
    sd = Math.sin(chia);
    cd = Math.cos(chia);

    xx =  cd * cb - sb * sd * cc;
    yx =  cd * sb * ca + sd * cc * cb * ca - sa * sd * sc;
    zx =  cd * sb * sa + sd * cc * cb * sa + ca * sd * sc;
    xy = -sd * cb - sb * cd * cc;
    yy = -sd * sb * ca + cd * cc * cb * ca - sa * cd * sc;
    zy = -sd * sb * sa + cd * cc * cb * sa + ca * cd * sc;
    xz =  sb * sc;
    yz = -sc * cb * ca - sa * cc;
    zz = -sc * cb * sa + cc * ca;

    if (tt2 === 0) {
        // Perform rotation from epoch to J2000.0.
        return new RotationMatrix([
            [xx, yx, zx],
            [xy, yy, zy],
            [xz, yz, zz]
        ]);
    }

    // Perform rotation from J2000.0 to epoch.
    return new RotationMatrix([
        [xx, xy, xz],
        [yx, yy, yz],
        [zx, zy, zz]
    ]);
}

function era(time) {    // Earth Rotation Angle
    const thet1 = 0.7790572732640 + 0.00273781191135448 * time.ut;
    const thet3 = time.ut % 1;
    let theta = 360 * ((thet1 + thet3) % 1);
    if (theta < 0) {
        theta += 360;
    }
    return theta;
}

function sidereal_time(time) {          // calculates Greenwich Apparent Sidereal Time (GAST)
    const t = time.tt / 36525;
    let eqeq = 15 * e_tilt(time).ee;    // Replace with eqeq=0 to get GMST instead of GAST (if we ever need it)
    const theta = era(time);
    const st = (eqeq + 0.014506 +
        (((( -    0.0000000368   * t
            -    0.000029956  ) * t
            -    0.00000044   ) * t
            +    1.3915817    ) * t
            + 4612.156534     ) * t);

    let gst = ((st/3600 + theta) % 360) / 15;
    if (gst < 0) {
        gst += 24;
    }
    return gst;
}

function terra(observer, st) {
    const df = 1 - 0.003352819697896;    // flattening of the Earth
    const df2 = df * df;
    const phi = observer.latitude * DEG2RAD;
    const sinphi = Math.sin(phi);
    const cosphi = Math.cos(phi);
    const c = 1 / Math.sqrt(cosphi*cosphi + df2*sinphi*sinphi);
    const s = df2 * c;
    const ht_km = observer.height / 1000;
    const ach = EARTH_EQUATORIAL_RADIUS_KM*c + ht_km;
    const ash = EARTH_EQUATORIAL_RADIUS_KM*s + ht_km;
    const stlocl = (15*st + observer.longitude) * DEG2RAD;
    const sinst = Math.sin(stlocl);
    const cosst = Math.cos(stlocl);
    return {
        pos: [ach*cosphi*cosst/KM_PER_AU, ach*cosphi*sinst/KM_PER_AU, ash*sinphi/KM_PER_AU],
        vel: [-ANGVEL*ach*cosphi*sinst*86400, ANGVEL*ach*cosphi*cosst*86400, 0]
    };
}

function nutation(time, direction, pos) {
    const r = nutation_rot(time, direction);
    return [
        r.rot[0][0]*pos[0] + r.rot[1][0]*pos[1] + r.rot[2][0]*pos[2],
        r.rot[0][1]*pos[0] + r.rot[1][1]*pos[1] + r.rot[2][1]*pos[2],
        r.rot[0][2]*pos[0] + r.rot[1][2]*pos[1] + r.rot[2][2]*pos[2]
    ];
}

function nutation_rot(time, direction) {
    const tilt = e_tilt(time);
    const oblm = tilt.mobl * DEG2RAD;
    const oblt = tilt.tobl * DEG2RAD;
    const psi = tilt.dpsi * ASEC2RAD;
    const cobm = Math.cos(oblm);
    const sobm = Math.sin(oblm);
    const cobt = Math.cos(oblt);
    const sobt = Math.sin(oblt);
    const cpsi = Math.cos(psi);
    const spsi = Math.sin(psi);

    const xx = cpsi;
    const yx = -spsi * cobm;
    const zx = -spsi * sobm;
    const xy = spsi * cobt;
    const yy = cpsi * cobm * cobt + sobm * sobt;
    const zy = cpsi * sobm * cobt - cobm * sobt;
    const xz = spsi * sobt;
    const yz = cpsi * cobm * sobt - sobm * cobt;
    const zz = cpsi * sobm * sobt + cobm * cobt;

    if (direction === 0) {
        // forward rotation
        return new RotationMatrix([
            [xx, xy, xz],
            [yx, yy, yz],
            [zx, zy, zz]
        ]);
    }

    // inverse rotation
    return new RotationMatrix([
        [xx, yx, zx],
        [xy, yy, zy],
        [xz, yz, zz]
    ]);
}

function geo_pos(time, observer) {
    const gast = sidereal_time(time);
    const pos1 = terra(observer, gast).pos;
    const pos2 = nutation(time, -1, pos1);
    const pos3 = precession(time.tt, pos2, 0);
    return pos3;
}

/**
 * Holds the Cartesian coordinates of a vector in 3D space,
 * along with the time at which the vector is valid.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {number} x             The x-coordinate expressed in astronomical units (AU).
 * @property {number} y             The y-coordinate expressed in astronomical units (AU).
 * @property {number} z             The z-coordinate expressed in astronomical units (AU).
 * @property {Astronomy.AstroTime} t     The time at which the vector is valid.
 */
class Vector {
    constructor(x, y, z, t) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.t = t;
    }

    /**
     * Returns the length of the vector in astronomical units (AU).
     * @returns {number}
     */
    Length() {
        return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
    }
}

/**
 * Holds spherical coordinates: latitude, longitude, distance.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {number} lat       The latitude angle: -90..+90 degrees.
 * @property {number} lon       The longitude angle: 0..360 degrees.
 * @property {number} dist      Distance in AU.
 */
class Spherical {
    constructor(lat, lon, dist) {
        this.lat  = VerifyNumber(lat);
        this.lon  = VerifyNumber(lon);
        this.dist = VerifyNumber(dist);
    }
}

/**
 * Create spherical coordinates.
 *
 * @param {number} lat
 *      The angular distance above or below the reference plane, in degrees.
 *
 * @param {number} lon
 *      The angular distance around the reference plane, in degrees.
 *
 * @param {number} dist
 *      A radial distance in AU.
 *
 * @returns {Astronomy.Spherical}
 */
Astronomy.MakeSpherical = function(lat, lon, dist) {
    return new Spherical(lat, lon, dist);
}

/**
 * Holds right ascension, declination, and distance of a celestial object.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {number} ra
 *      Right ascension in sidereal hours: [0, 24).
 *
 * @property {number} dec
 *      Declination in degrees: [-90, +90].
 *
 * @property {number} dist
 *      Distance to the celestial object expressed in
 *      <a href="https://en.wikipedia.org/wiki/Astronomical_unit">astronomical units</a> (AU).
 */
class EquatorialCoordinates {
    constructor(ra, dec, dist) {
        this.ra   = VerifyNumber(ra);
        this.dec  = VerifyNumber(dec);
        this.dist = VerifyNumber(dist);
    }
}

function IsValidRotationArray(rot) {
    if (!(rot instanceof Array) || (rot.length !== 3))
        return false;

    for (let i=0; i < 3; ++i) {
        if (!(rot[i] instanceof Array) || (rot[i].length !== 3))
            return false;

        for (let j=0; j < 3; ++j)
            if (!Number.isFinite(rot[i][j]))
                return false;
    }

    return true;
}


/**
 * Contains a rotation matrix that can be used to transform one coordinate system to another.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {Array<Array<number>>} rot
 *      A normalized 3x3 rotation matrix.
 */
class RotationMatrix {
    constructor(rot) {
        this.rot = rot;
    }
}

/**
 * Creates a rotation matrix that can be used to transform one coordinate system to another.
 *
 * @param {Array<Array<number>>} rot
 *      An array [3][3] of numbers. Defines a rotation matrix used to premultiply
 *      a 3D vector to reorient it into another coordinate system.
 *
 * @returns {Astronomy.RotationMatrix}
 */
Astronomy.MakeRotation = function(rot) {
    if (!IsValidRotationArray(rot))
        throw 'Argument must be a [3][3] array of numbers';

    return new RotationMatrix(rot);
}

/**
 * Holds azimuth (compass direction) and altitude (angle above/below the horizon)
 * of a celestial object as seen by an observer at a particular location on the Earth's surface.
 * Also holds right ascension and declination of the same object.
 * All of these coordinates are optionally adjusted for atmospheric refraction;
 * therefore the right ascension and declination values may not exactly match
 * those found inside a corresponding {@link Astronomy.EquatorialCoordinates} object.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {number} azimuth
 *      A horizontal compass direction angle in degrees measured starting at north
 *      and increasing positively toward the east.
 *      The value is in the range [0, 360).
 *      North = 0, east = 90, south = 180, west = 270.
 *
 * @property {number} altitude
 *      A vertical angle in degrees above (positive) or below (negative) the horizon.
 *      The value is in the range [-90, +90].
 *      The altitude angle is optionally adjusted upward due to atmospheric refraction.
 *
 * @property {number} ra
 *      The right ascension of the celestial body in sidereal hours.
 *      The value is in the reange [0, 24).
 *      If `altitude` was adjusted for atmospheric reaction, `ra`
 *      is likewise adjusted.
 *
 * @property {number} dec
 *      The declination of of the celestial body in degrees.
 *      The value in the range [-90, +90].
 *      If `altitude` was adjusted for atmospheric reaction, `dec`
 *      is likewise adjusted.
 */
class HorizontalCoordinates {
    constructor(azimuth, altitude, ra, dec) {
        this.azimuth  = VerifyNumber(azimuth);
        this.altitude = VerifyNumber(altitude);
        this.ra       = VerifyNumber(ra);
        this.dec      = VerifyNumber(dec);
    }
}

/**
 * Holds ecliptic coordinates of a celestial body.
 * The origin and date of the coordinate system may vary depending on the caller's usage.
 * In general, ecliptic coordinates are measured with respect to the mean plane of the Earth's
 * orbit around the Sun.
 * Includes Cartesian coordinates `(ex, ey, ez)` measured in
 * <a href="https://en.wikipedia.org/wiki/Astronomical_unit">astronomical units</a> (AU)
 * and spherical coordinates `(elon, elat)` measured in degrees.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {number} ex
 *      The Cartesian x-coordinate of the body in astronomical units (AU).
 *      The x-axis is within the ecliptic plane and is oriented in the direction of the
 *      <a href="https://en.wikipedia.org/wiki/Equinox_(celestial_coordinates)">equinox</a>.
 *
 * @property {number} ey
 *      The Cartesian y-coordinate of the body in astronomical units (AU).
 *      The y-axis is within the ecliptic plane and is oriented 90 degrees
 *      counterclockwise from the equinox, as seen from above the Sun's north pole.
 *
 * @property {number} ez
 *      The Cartesian z-coordinate of the body in astronomical units (AU).
 *      The z-axis is oriented perpendicular to the ecliptic plane,
 *      along the direction of the Sun's north pole.
 *
 * @property {number} elat
 *      The ecliptic latitude of the body in degrees.
 *      This is the angle north or south of the ecliptic plane.
 *      The value is in the range [-90, +90].
 *      Positive values are north and negative values are south.
 *
 * @property {number} elon
 *      The ecliptic longitude of the body in degrees.
 *      This is the angle measured counterclockwise around the ecliptic plane,
 *      as seen from above the Sun's north pole.
 *      This is the same direction that the Earth orbits around the Sun.
 *      The angle is measured starting at 0 from the equinox and increases
 *      up to 360 degrees.
 */
class EclipticCoordinates {
    constructor(ex, ey, ez, elat, elon) {
        this.ex   = VerifyNumber(ex);
        this.ey   = VerifyNumber(ey);
        this.ez   = VerifyNumber(ez);
        this.elat = VerifyNumber(elat);
        this.elon = VerifyNumber(elon);
    }
}

function vector2radec(pos)
{
    const xyproj = pos[0]*pos[0] + pos[1]*pos[1];
    const dist = Math.sqrt(xyproj + pos[2]*pos[2]);
    if (xyproj === 0)
    {
        if (pos[2] === 0)
            throw 'Indeterminate sky coordinates';

        if (pos[2] < 0)
            return { ra:0, dec:-90, dist:dist };

        return { ra:0, dec:+90, dist:dist };
    }

    let ra = Math.atan2(pos[1], pos[0]) / (DEG2RAD * 15);
    if (ra < 0) {
        ra += 24;
    }
    let dec = Math.atan2(pos[2], Math.sqrt(xyproj)) / DEG2RAD;
    return new EquatorialCoordinates(ra, dec, dist);
}

function spin(angle, pos1) {
    const angr = angle * DEG2RAD;
    const cosang = Math.cos(angr);
    const sinang = Math.sin(angr);
    const xx = cosang;
    const yx = sinang;
    const zx = 0;
    const xy = -sinang;
    const yy = cosang;
    const zy = 0;
    const xz = 0;
    const yz = 0;
    const zz = 1;
    let pos2 = [
        xx*pos1[0] + yx*pos1[1] + zx*pos1[2],
        xy*pos1[0] + yy*pos1[1] + zy*pos1[2],
        xz*pos1[0] + yz*pos1[1] + zz*pos1[2]
    ];
    return pos2;
}

/**
 * Given a date and time, a geographic location of an observer on the Earth, and
 * equatorial coordinates (right ascension and declination) of a celestial body,
 * returns horizontal coordinates (azimuth and altitude angles) for that body
 * as seen by that observer. Allows optional correction for atmospheric refraction.
 *
 * @param {(Date|number|Astronomy.AstroTime)} date
 *      The date and time for which to find horizontal coordinates.
 *
 * @param {Astronomy.Observer} observer
 *      The location of the observer for which to find horizontal coordinates.
 *
 * @param {number} ra
 *      Right ascension in sidereal hours of the celestial object,
 *      referred to the mean equinox of date for the J2000 epoch.
 *
 * @param {number} dec
 *      Declination in degrees of the celestial object,
 *      referred to the mean equator of date for the J2000 epoch.
 *      Positive values are north of the celestial equator and negative values are south.
 *
 * @param {string} refraction
 *      If omitted or has a false-like value (false, null, undefined, etc.)
 *      the calculations are performed without any correction for atmospheric
 *      refraction. If the value is the string `"normal"`,
 *      uses the recommended refraction correction based on Meeus "Astronomical Algorithms"
 *      with a linear taper more than 1 degree below the horizon. The linear
 *      taper causes the refraction to linearly approach 0 as the altitude of the
 *      body approaches the nadir (-90 degrees).
 *      If the value is the string `"jplhor"`, uses a JPL Horizons
 *      compatible formula. This is the same algorithm as `"normal"`,
 *      only without linear tapering; this can result in physically impossible
 *      altitudes of less than -90 degrees, which may cause problems for some applications.
 *      (The `"jplhor"` option was created for unit testing against data
 *      generated by JPL Horizons, and is otherwise not recommended for use.)
 *
 * @returns {Astronomy.HorizontalCoordinates}
 */
Astronomy.Horizon = function(date, observer, ra, dec, refraction) {     // based on NOVAS equ2hor()
    let time = Astronomy.MakeTime(date);
    VerifyObserver(observer);
    VerifyNumber(ra);
    VerifyNumber(dec);

    const sinlat = Math.sin(observer.latitude * DEG2RAD);
    const coslat = Math.cos(observer.latitude * DEG2RAD);
    const sinlon = Math.sin(observer.longitude * DEG2RAD);
    const coslon = Math.cos(observer.longitude * DEG2RAD);
    const sindc = Math.sin(dec * DEG2RAD);
    const cosdc = Math.cos(dec * DEG2RAD);
    const sinra = Math.sin(ra * 15 * DEG2RAD);
    const cosra = Math.cos(ra * 15 * DEG2RAD);
    let uze = [coslat*coslon, coslat*sinlon, sinlat];
    let une = [-sinlat*coslon, -sinlat*sinlon, coslat];
    let uwe = [sinlon, -coslon, 0];

    const spin_angle = -15 * sidereal_time(time);
    let uz = spin(spin_angle, uze);
    let un = spin(spin_angle, une);
    let uw = spin(spin_angle, uwe);

    let p = [cosdc*cosra, cosdc*sinra, sindc];

    const pz = p[0]*uz[0] + p[1]*uz[1] + p[2]*uz[2];
    const pn = p[0]*un[0] + p[1]*un[1] + p[2]*un[2];
    const pw = p[0]*uw[0] + p[1]*uw[1] + p[2]*uw[2];

    let proj = Math.sqrt(pn*pn + pw*pw);
    let az = 0;
    if (proj > 0) {
        az = -Math.atan2(pw, pn) * RAD2DEG;
        if (az < 0) az += 360;
        if (az >= 360) az -= 360;
    }
    let zd = Math.atan2(proj, pz) * RAD2DEG;
    let out_ra = ra;
    let out_dec = dec;

    if (refraction) {
        let zd0 = zd;
        let refr = Astronomy.Refraction(refraction, 90-zd);
        zd -= refr;
        if (refr > 0.0 && zd > 3.0e-4) {
            const sinzd = Math.sin(zd * DEG2RAD);
            const coszd = Math.cos(zd * DEG2RAD);
            const sinzd0 = Math.sin(zd0 * DEG2RAD);
            const coszd0 = Math.cos(zd0 * DEG2RAD);
            var pr = [];
            for (let j=0; j<3; ++j) {
                pr.push(((p[j] - coszd0 * uz[j]) / sinzd0)*sinzd + uz[j]*coszd);
            }
            proj = Math.sqrt(pr[0]*pr[0] + pr[1]*pr[1]);
            if (proj > 0) {
                out_ra = Math.atan2(pr[1], pr[0]) * RAD2DEG / 15;
                if (out_ra < 0) {
                    out_ra += 24;
                }
                if (out_ra >= 24) {
                    out_ra -= 24;
                }
            } else {
                out_ra = 0;
            }
            out_dec = Math.atan2(pr[2], proj) * RAD2DEG;
        }
    }

    return new HorizontalCoordinates(az, 90-zd, out_ra, out_dec);
}


function VerifyObserver(observer) {
    if (!(observer instanceof Observer)) {
        throw `Not an instance of the Observer class: ${observer}`;
    }
    VerifyNumber(observer.latitude);
    VerifyNumber(observer.longitude);
    VerifyNumber(observer.height);
    if (observer.latitude < -90 || observer.latitude > +90) {
        throw `Latitude ${observer.latitude} is out of range. Must be -90..+90.`;
    }
    return observer;
}


/**
 * Represents the geographic location of an observer on the surface of the Earth.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {number} latitude
 *      The observer's geographic latitude in degrees north of the Earth's equator.
 *      The value is negative for observers south of the equator.
 *      Must be in the range -90 to +90.
 *
 * @property {number} longitude
 *      The observer's geographic longitude in degrees east of the prime meridian
 *      passing through Greenwich, England.
 *      The value is negative for observers west of the prime meridian.
 *      The value should be kept in the range -180 to +180 to minimize floating point errors.
 *
 * @property {number} height
 *      The observer's elevation above mean sea level, expressed in meters.
 */
class Observer {
    constructor(latitude_degrees, longitude_degrees, height_in_meters) {
        this.latitude  = latitude_degrees;
        this.longitude = longitude_degrees;
        this.height    = height_in_meters;
        VerifyObserver(this);
    }
}


/**
 * Creates an {@link Astronomy.Observer} object that represents a location
 * on the surface of the Earth from which observations are made.
 *
 * @param {number} latitude_degrees
 *      The observer's geographic latitude in degrees north of the Earth's equator.
 *      The value is negative for observers south of the equator.
 *      Must be in the range -90 to +90.
 *
 * @param {number} longitude_degrees
 *      The observer's geographic longitude in degrees east of the prime meridian
 *      passing through Greenwich, England.
 *      The value is negative for observers west of the prime meridian.
 *      The value should be kept in the range -180 to +180 to minimize floating point errors.
 *
 * @param {number} height_in_meters
 *      The observer's elevation above mean sea level, expressed in meters.
 *      If omitted, the elevation is assumed to be 0 meters.
 */
Astronomy.MakeObserver = function(latitude_degrees, longitude_degrees, height_in_meters) {
    return new Observer(latitude_degrees, longitude_degrees, height_in_meters || 0);
}

/**
 * Returns apparent geocentric true ecliptic coordinates of date for the Sun.
 * <i>Geocentric</i> means coordinates as the Sun would appear to a hypothetical observer
 * at the center of the Earth.
 * <i>Ecliptic coordinates of date</i> are measured along the plane of the Earth's mean
 * orbit around the Sun, using the
 * <a href="https://en.wikipedia.org/wiki/Equinox_(celestial_coordinates)">equinox</a>
 * of the Earth as adjusted for precession and nutation of the Earth's
 * axis of rotation on the given date.
 *
 * @param {(Date | number | Astronomy.AstroTime)} date
 *      The date and time at which to calculate the Sun's apparent location as seen from
 *      the center of the Earth.
 *
 * @returns {Astronomy.EclipticCoordinates}
 */
Astronomy.SunPosition = function(date) {
    // Correct for light travel time from the Sun.
    // This is really the same as correcting for aberration.
    // Otherwise season calculations (equinox, solstice) will all be early by about 8 minutes!
    const time = Astronomy.MakeTime(date).AddDays(-1 / C_AUDAY);

    // Get heliocentric cartesian coordinates of Earth in J2000.
    const earth2000 = CalcVsop(vsop.Earth, time);

    // Convert to geocentric location of the Sun.
    const sun2000 = [-earth2000.x, -earth2000.y, -earth2000.z];

    // Convert to equator-of-date equatorial cartesian coordinates.
    const stemp = precession(0, sun2000, time.tt);
    const sun_ofdate = nutation(time, 0, stemp);

    // Convert to ecliptic coordinates of date.
    const true_obliq = DEG2RAD * e_tilt(time).tobl;
    const cos_ob = Math.cos(true_obliq);
    const sin_ob = Math.sin(true_obliq);

    const gx = sun_ofdate[0];
    const gy = sun_ofdate[1];
    const gz = sun_ofdate[2];

    const sun_ecliptic = RotateEquatorialToEcliptic(gx, gy, gz, cos_ob, sin_ob);
    return sun_ecliptic;
}

/**
 * Returns topocentric equatorial coordinates (right ascension and declination)
 * in one of two different systems: J2000 or true-equator-of-date.
 * Allows optional correction for aberration.
 * Always corrects for light travel time (represents the object as seen by the observer
 * with light traveling to the Earth at finite speed, not where the object is right now).
 * <i>Topocentric</i> refers to a position as seen by an observer on the surface of the Earth.
 * This function corrects for
 * <a href="https://en.wikipedia.org/wiki/Parallax">parallax</a>
 * of the object between a geocentric observer and a topocentric observer.
 * This is most significant for the Moon, because it is so close to the Earth.
 * However, it can have a small effect on the apparent positions of other bodies.
 *
 * @param {string} body
 *      The name of the body for which to find equatorial coordinates.
 *      Not allowed to be `"Earth"`.
 *
 * @param {(Date | number | Astronomy.Time)} date
 *      Specifies the date and time at which the body is to be observed.
 *
 * @param {Astronomy.Observer} observer
 *      The location on the Earth of the observer.
 *      Call {@link Astronomy.MakeObserver} to create an observer object.
 *
 * @param {bool} ofdate
 *      Pass `true` to return equatorial coordinates of date,
 *      i.e. corrected for precession and nutation at the given date.
 *      This is needed to get correct horizontal coordinates when you call
 *      {@link Astronomy.Horizon}.
 *      Pass `false` to return equatorial coordinates in the J2000 system.
 *
 * @param {bool} aberration
 *      Pass `true` to correct for
 *      <a href="https://en.wikipedia.org/wiki/Aberration_of_light">aberration</a>,
 *      or `false` to leave uncorrected.
 *
 * @returns {Astronomy.EquatorialCoordinates}
 *      The topocentric coordinates of the body as adjusted for the given observer.
 */
Astronomy.Equator = function(body, date, observer, ofdate, aberration) {
    VerifyObserver(observer);
    VerifyBoolean(ofdate);
    VerifyBoolean(aberration);
    const time = Astronomy.MakeTime(date);
    const gc_observer = geo_pos(time, observer);
    const gc = Astronomy.GeoVector(body, time, aberration);
    const j2000 = [
        gc.x - gc_observer[0],
        gc.y - gc_observer[1],
        gc.z - gc_observer[2]
    ];

    if (!ofdate)
        return vector2radec(j2000);

    const temp = precession(0, j2000, time.tt);
    const datevect = nutation(time, 0, temp);
    return vector2radec(datevect);
}

function RotateEquatorialToEcliptic(gx, gy, gz, cos_ob, sin_ob) {
    // Rotate equatorial vector to obtain ecliptic vector.
    const ex =  gx;
    const ey =  gy*cos_ob + gz*sin_ob;
    const ez = -gy*sin_ob + gz*cos_ob;

    const xyproj = Math.sqrt(ex*ex + ey*ey);
    let elon = 0;
    if (xyproj > 0) {
        elon = RAD2DEG * Math.atan2(ey, ex);
        if (elon < 0) elon += 360;
    }
    let elat = RAD2DEG * Math.atan2(ez, xyproj);
    return new EclipticCoordinates(ex, ey, ez, elat, elon);
}

/**
 * Given J2000 equatorial Cartesian coordinates,
 * returns J2000 ecliptic latitude, longitude, and cartesian coordinates.
 * You can call {@link Astronomy.GeoVector} and use its (x, y, z) return values
 * to pass into this function.
 *
 * @param {number} gx
 *      The x-coordinate of a 3D vector in the J2000 equatorial coordinate system.
 *
 * @param {number} gy
 *      The y-coordinate of a 3D vector in the J2000 equatorial coordinate system.
 *
 * @param {number} gz
 *      The z-coordinate of a 3D vector in the J2000 equatorial coordinate system.
 *
 * @returns {Astronomy.EclipticCoordinates}
 */
Astronomy.Ecliptic = function(gx, gy, gz) {
    // Based on NOVAS functions equ2ecl() and equ2ecl_vec().
    if (ob2000 === undefined) {
        // Lazy-evaluate and keep the mean obliquity of the ecliptic at J2000.
        // This way we don't need to crunch the numbers more than once.
        ob2000 = DEG2RAD * e_tilt(Astronomy.MakeTime(J2000)).mobl;
        cos_ob2000 = Math.cos(ob2000);
        sin_ob2000 = Math.sin(ob2000);
    }

    VerifyNumber(gx);
    VerifyNumber(gy);
    VerifyNumber(gz);

    return RotateEquatorialToEcliptic(gx, gy, gz, cos_ob2000, sin_ob2000);
}

/**
 * Calculates the geocentric Cartesian coordinates for the Moon in the J2000 equatorial system.
 * Based on the Nautical Almanac Office's <i>Improved Lunar Ephemeris</i> of 1954,
 * which in turn derives from E. W. Brown's lunar theories.
 * Adapted from Turbo Pascal code from the book
 * <a href="https://www.springer.com/us/book/9783540672210">Astronomy on the Personal Computer</a>
 * by Montenbruck and Pfleger.
 *
 * @param {(Date|number|Astronomy.AstroTime)} date
 *      The date and time for which to calculate the Moon's geocentric position.
 *
 * @returns {Astronomy.Vector}
 */
Astronomy.GeoMoon = function(date) {
    var time = Astronomy.MakeTime(date);
    var moon = CalcMoon(time);

    // Convert geocentric ecliptic spherical coords to cartesian coords.
    var dist_cos_lat = moon.distance_au * Math.cos(moon.geo_eclip_lat);
    var gepos = [
        dist_cos_lat * Math.cos(moon.geo_eclip_lon),
        dist_cos_lat * Math.sin(moon.geo_eclip_lon),
        moon.distance_au * Math.sin(moon.geo_eclip_lat)
    ];

    // Convert ecliptic coordinates to equatorial coordinates, both in mean equinox of date.
    var mpos1 = ecl2equ_vec(time, gepos);

    // Convert from mean equinox of date to J2000...
    var mpos2 = precession(time.tt, mpos1, 0);

    return new Vector(mpos2[0], mpos2[1], mpos2[2], time);
}

function VsopFormula(formula, t) {
    let tpower = 1;
    let coord = 0;
    for (let series of formula) {
        let sum = 0;
        for (let [ampl, phas, freq] of series) {
            sum += ampl * Math.cos(phas + (t * freq));
        }
        coord += tpower * sum;
        tpower *= t;
    }
    return coord;
}

function VsopDeriv(formula, t) {
    let tpower = 1;   // t^s
    let dpower = 0;   // t^(s-1)
    let deriv = 0;
    let s = 0;
    for (let series of formula) {
        let sin_sum = 0;
        let cos_sum = 0;
        for (let [ampl, phas, freq] of series) {
            let angle = phas + (t * freq);
            sin_sum += ampl * freq * Math.sin(angle);
            if (s > 0) {
                cos_sum += ampl * Math.cos(angle);
            }
        }
        deriv += (s * dpower * cos_sum) - (tpower * sin_sum);
        dpower = tpower;
        tpower *= t;
        ++s;
    }
    return deriv;
}

const DAYS_PER_MILLENNIUM = 365250;
const LON_INDEX = 0;
const LAT_INDEX = 1;
const RAD_INDEX = 2;

function VsopRotate(eclip) {
    // Convert ecliptic cartesian coordinates to equatorial cartesian coordinates.
    return new TerseVector(
        eclip[0] + 0.000000440360*eclip[1] - 0.000000190919*eclip[2],
        -0.000000479966*eclip[0] + 0.917482137087*eclip[1] - 0.397776982902*eclip[2],
        0.397776982902*eclip[1] + 0.917482137087*eclip[2]
    );
}

function VsopSphereToRect(lon, lat, radius) {
    // Convert spherical coordinates to ecliptic cartesian coordinates.
    const r_coslat = radius * Math.cos(lat);
    return [
        r_coslat * Math.cos(lon),
        r_coslat * Math.sin(lon),
        radius * Math.sin(lat)
    ];
}

function CalcVsop(model, time) {
    const t = time.tt / DAYS_PER_MILLENNIUM;   // millennia since 2000
    const lon = VsopFormula(model[LON_INDEX], t);
    const lat = VsopFormula(model[LAT_INDEX], t);
    const rad = VsopFormula(model[RAD_INDEX], t);
    const eclip = VsopSphereToRect(lon, lat, rad);
    return VsopRotate(eclip).ToAstroVector(time);
}

function CalcVsopPosVel(model, tt) {
    const t = tt / DAYS_PER_MILLENNIUM;

    // Calculate the VSOP "B" trigonometric series to obtain ecliptic spherical coordinates.
    const lon = VsopFormula(model[LON_INDEX], t);
    const lat = VsopFormula(model[LAT_INDEX], t);
    const rad = VsopFormula(model[RAD_INDEX], t);

    const dlon_dt = VsopDeriv(model[LON_INDEX], t);
    const dlat_dt = VsopDeriv(model[LAT_INDEX], t);
    const drad_dt = VsopDeriv(model[RAD_INDEX], t);

    // Use spherical coords and spherical derivatives to calculate
    // the velocity vector in rectangular coordinates.

    const coslon = Math.cos(lon);
    const sinlon = Math.sin(lon);
    const coslat = Math.cos(lat);
    const sinlat = Math.sin(lat);

    const vx = (
        + (drad_dt * coslat * coslon)
        - (rad * sinlat * coslon * dlat_dt)
        - (rad * coslat * sinlon * dlon_dt)
    );

    const vy = (
        + (drad_dt * coslat * sinlon)
        - (rad * sinlat * sinlon * dlat_dt)
        + (rad * coslat * coslon * dlon_dt)
    );

    const vz = (
        + (drad_dt * sinlat)
        + (rad * coslat * dlat_dt)
    );

    const eclip_pos = VsopSphereToRect(lon, lat, rad);

    // Convert speed units from [AU/millennium] to [AU/day].
    const eclip_vel = [
        vx / DAYS_PER_MILLENNIUM,
        vy / DAYS_PER_MILLENNIUM,
        vz / DAYS_PER_MILLENNIUM
    ];

    // Rotate the vectors from ecliptic to equatorial coordinates.
    const equ_pos = VsopRotate(eclip_pos);
    const equ_vel = VsopRotate(eclip_vel);
    return new body_state_t(tt, equ_pos, equ_vel);
}

function AdjustBarycenter(ssb, time, body, pmass) {
    const shift = pmass / (pmass + SUN_GM);
    const planet = CalcVsop(vsop[body], time);
    ssb.x += shift * planet.x;
    ssb.y += shift * planet.y;
    ssb.z += shift * planet.z;
}

function CalcSolarSystemBarycenter(time) {
    const ssb = new Vector(0.0, 0.0, 0.0, time);
    AdjustBarycenter(ssb, time, 'Jupiter', JUPITER_GM);
    AdjustBarycenter(ssb, time, 'Saturn',  SATURN_GM);
    AdjustBarycenter(ssb, time, 'Uranus',  URANUS_GM);
    AdjustBarycenter(ssb, time, 'Neptune', NEPTUNE_GM);
    return ssb;
}

// Pluto integrator begins ----------------------------------------------------

$ASTRO_PLUTO_TABLE()

class TerseVector {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    ToAstroVector(t) {
        return new Vector(this.x, this.y, this.z, t);
    }

    quadrature() {
        return this.x*this.x + this.y*this.y + this.z*this.z;
    }

    add(other) {
        return new TerseVector(this.x + other.x, this.y + other.y, this.z + other.z);
    }

    sub(other) {
        return new TerseVector(this.x - other.x, this.y - other.y, this.z - other.z);
    }

    incr(other) {
        this.x += other.x;
        this.y += other.y;
        this.z += other.z;
    }

    decr(other) {
        this.x -= other.x;
        this.y -= other.y;
        this.z -= other.z;
    }

    mul(scalar) {
        return new TerseVector(scalar * this.x, scalar * this.y, scalar * this.z);
    }

    div(scalar) {
        return new TerseVector(this.x / scalar, this.y / scalar, this.z / scalar);
    }

    mean(other) {
        return new TerseVector(
            (this.x + other.x) / 2,
            (this.y + other.y) / 2,
            (this.z + other.z) / 2
        );
    }
}

class body_state_t {
    constructor(tt, r, v) {
        this.tt = tt;
        this.r = r;
        this.v = v;
    }
}

function BodyStateFromTable(entry) {
    let [ tt, [rx, ry, rz], [vx, vy, vz] ] = entry;
    return new body_state_t(tt, new TerseVector(rx, ry, rz), new TerseVector(vx, vy, vz));
}

function AdjustBarycenterPosVel(ssb, tt, body, planet_gm) {
    const shift = planet_gm / (planet_gm + SUN_GM);
    const planet = CalcVsopPosVel(vsop[body], tt);
    ssb.r.incr(planet.r.mul(shift));
    ssb.v.incr(planet.v.mul(shift));
    return planet;
}

function AccelerationIncrement(small_pos, gm, major_pos) {
    const delta = major_pos.sub(small_pos);
    const r2 = delta.quadrature();
    return delta.mul(gm / (r2 * Math.sqrt(r2)));
}

class major_bodies_t {
    constructor(tt) {
        // Accumulate the Solar System Barycenter position.
        let ssb = new body_state_t(tt, new TerseVector(0, 0, 0), new TerseVector(0, 0, 0));

        this.Jupiter = AdjustBarycenterPosVel(ssb, tt, 'Jupiter', JUPITER_GM);
        this.Saturn  = AdjustBarycenterPosVel(ssb, tt, 'Saturn',  SATURN_GM);
        this.Uranus  = AdjustBarycenterPosVel(ssb, tt, 'Uranus',  URANUS_GM);
        this.Neptune = AdjustBarycenterPosVel(ssb, tt, 'Neptune', NEPTUNE_GM);

        // Convert planets' [pos, vel] vectors from heliocentric to barycentric.
        this.Jupiter.r.decr(ssb.r);  this.Jupiter.v.decr(ssb.v);
        this.Saturn.r.decr(ssb.r);   this.Saturn.v.decr(ssb.v);
        this.Uranus.r.decr(ssb.r);   this.Uranus.v.decr(ssb.v);
        this.Neptune.r.decr(ssb.r);  this.Neptune.v.decr(ssb.v);

        // Convert heliocentric SSB to barycentric Sun.
        this.Sun = new body_state_t(tt, ssb.r.mul(-1), ssb.v.mul(-1));
    }

    Acceleration(pos) {
        // Use barycentric coordinates of the Sun and major planets to calculate
        // the gravitational acceleration vector experienced at location 'pos'.
        let acc = AccelerationIncrement(pos, SUN_GM,     this.Sun.r);
        acc.incr(AccelerationIncrement (pos, JUPITER_GM, this.Jupiter.r));
        acc.incr(AccelerationIncrement (pos, SATURN_GM,  this.Saturn.r));
        acc.incr(AccelerationIncrement (pos, URANUS_GM,  this.Uranus.r));
        acc.incr(AccelerationIncrement (pos, NEPTUNE_GM, this.Neptune.r));
        return acc;
    }
}

class body_grav_calc_t {
    constructor(tt, r, v, a) {
        this.tt = tt;   // J2000 terrestrial time [days]
        this.r = r;     // position [au]
        this.v = v;     // velocity [au/day]
        this.a = a;     // acceleration [au/day^2]
    }
}

class grav_sim_t {
    constructor(bary, grav) {
        this.bary = bary;
        this.grav = grav;
    }
}

function UpdatePosition(dt, r, v, a) {
    return new TerseVector(
        r.x + dt*(v.x + dt*a.x/2),
        r.y + dt*(v.y + dt*a.y/2),
        r.z + dt*(v.z + dt*a.z/2)
    );
}

function GravSim(tt2, calc1) {
    const dt = tt2 - calc1.tt;

    // Calculate where the major bodies (Sun, Jupiter...Neptune) will be at tt2.
    const bary2 = new major_bodies_t(tt2);

    // Estimate position of small body as if current acceleration applies across the whole time interval.
    const approx_pos = UpdatePosition(dt, calc1.r, calc1.v, calc1.a);

    // Calculate the average acceleration of the endpoints.
    // This becomes our estimate of the mean effective acceleration over the whole interval.
    const mean_acc = bary2.Acceleration(approx_pos).mean(calc1.a);

    // Refine the estimates of [pos, vel, acc] at tt2 using the mean acceleration.
    const pos = UpdatePosition(dt, calc1.r, calc1.v, mean_acc);
    const vel = calc1.v.add(mean_acc.mul(dt));
    const acc = bary2.Acceleration(pos);
    const grav = new body_grav_calc_t(tt2, pos, vel, acc);
    return new grav_sim_t(bary2, grav);
}

const PLUTO_DT = 250;
const PLUTO_NSTEPS = (PLUTO_TIME_STEP / PLUTO_DT) + 1;
const pluto_cache = [];

function ClampIndex(frac, nsteps) {
    const index = Math.floor(frac);
    if (index < 0) {
        return 0;
    }
    if (index >= nsteps) {
        return nsteps-1;
    }
    return index;
}

function GravFromState(entry) {
    const state = BodyStateFromTable(entry);
    const bary = new major_bodies_t(state.tt);
    const r = state.r.add(bary.Sun.r);
    const v = state.v.add(bary.Sun.v);
    const a = bary.Acceleration(r);
    const grav = new body_grav_calc_t(state.tt, r, v, a);
    return new grav_sim_t(bary, grav);
}

function GetSegment(cache, tt) {
    if (tt < PlutoStateTable[0][0] || tt > PlutoStateTable[PLUTO_NUM_STATES-1][0]) {
        // Don't bother calculating a segment. Let the caller crawl backward/forward to this time.
        return null;
    }

    const seg_index = ClampIndex((tt - PlutoStateTable[0][0]) / PLUTO_TIME_STEP, PLUTO_NUM_STATES-1);
    if (!cache[seg_index]) {
        const seg = cache[seg_index] = [];

        // Each endpoint is exact.
        seg[0] = GravFromState(PlutoStateTable[seg_index]).grav;
        seg[PLUTO_NSTEPS-1] = GravFromState(PlutoStateTable[seg_index + 1]).grav;

        // Simulate forwards from the lower time bound.
        let i;
        let step_tt = seg[0].tt;
        for (i=1; i < PLUTO_NSTEPS-1; ++i)
            seg[i] = GravSim(step_tt += PLUTO_DT, seg[i-1]).grav;

        // Simulate backwards from the upper time bound.
        step_tt = seg[PLUTO_NSTEPS-1].tt;
        var reverse = [];
        reverse[PLUTO_NSTEPS-1] = seg[PLUTO_NSTEPS-1];
        for (i=PLUTO_NSTEPS-2; i > 0; --i)
            reverse[i] = GravSim(step_tt -= PLUTO_DT, reverse[i+1]).grav;

        // Fade-mix the two series so that there are no discontinuities.
        for (i=PLUTO_NSTEPS-2; i > 0; --i) {
            const ramp = i / (PLUTO_NSTEPS-1);
            seg[i].r = seg[i].r.mul(1 - ramp).add(reverse[i].r.mul(ramp));
            seg[i].v = seg[i].v.mul(1 - ramp).add(reverse[i].v.mul(ramp));
            seg[i].a = seg[i].a.mul(1 - ramp).add(reverse[i].a.mul(ramp));
        }
    }

    return cache[seg_index];
}

function CalcPlutoOneWay(entry, target_tt, dt) {
    let sim = GravFromState(entry);
    const n = Math.ceil((target_tt - sim.grav.tt) / dt);
    for (let i=0; i < n; ++i) {
        sim = GravSim((i+1 === n) ? target_tt : (sim.grav.tt + dt), sim.grav);
    }
    return sim;
}

function CalcPluto(time) {
    let r, bary;
    const seg = GetSegment(pluto_cache, time.tt);
    if (!seg) {
        // The target time is outside the year range 0000..4000.
        // Calculate it by crawling backward from 0000 or forward from 4000.
        // FIXFIXFIX - This is super slow. Could optimize this with extra caching if needed.
        let sim;
        if (time.tt < PlutoStateTable[0][0])
            sim = CalcPlutoOneWay(PlutoStateTable[0], time.tt, -PLUTO_DT);
        else
            sim = CalcPlutoOneWay(PlutoStateTable[PLUTO_NUM_STATES-1], time.tt, +PLUTO_DT);
        r = sim.grav.r;
        bary = sim.bary;
    } else {
        const left = ClampIndex((time.tt - seg[0].tt) / PLUTO_DT, PLUTO_NSTEPS-1);
        const s1 = seg[left];
        const s2 = seg[left+1];

        // Find mean acceleration vector over the interval.
        const acc = s1.a.mean(s2.a);

        // Use Newtonian mechanics to extrapolate away from t1 in the positive time direction.
        const ra = UpdatePosition(time.tt - s1.tt, s1.r, s1.v, acc);

        // Use Newtonian mechanics to extrapolate away from t2 in the negative time direction.
        const rb = UpdatePosition(time.tt - s2.tt, s2.r, s2.v, acc);

        // Use fade in/out idea to blend the two position estimates.
        const ramp = (time.tt - s1.tt)/PLUTO_DT;
        r = ra.mul(1 - ramp).add(rb.mul(ramp));
        bary = new major_bodies_t(time.tt);
    }
    return r.sub(bary.Sun.r).ToAstroVector(time);
}

// Pluto integrator ends -----------------------------------------------------

/**
 * Calculates heliocentric (i.e., with respect to the center of the Sun)
 * Cartesian coordinates in the J2000 equatorial system of a celestial
 * body at a specified time. The position is not corrected for light travel time or aberration.
 *
 * @param {string} body
 *      One of the strings
 *      `"Sun"`, `"Moon"`, `"Mercury"`, `"Venus"`,
 *      `"Earth"`, `"Mars"`, `"Jupiter"`, `"Saturn"`,
 *      `"Uranus"`, `"Neptune"`, `"Pluto"`,
 *      `"SSB"`, or `"EMB"`.
 *
 * @param {(Date | number | Astronomy.AstroTime)} date
 *      The date and time for which the body's position is to be calculated.
 *
 * @returns {Astronomy.Vector}
 */
Astronomy.HelioVector = function(body, date) {
    var time = Astronomy.MakeTime(date);
    if (body in vsop) {
        return CalcVsop(vsop[body], time);
    }
    if (body === 'Pluto') {
        return CalcPluto(time);
    }
    if (body === 'Sun') {
        return new Vector(0, 0, 0, time);
    }
    if (body === 'Moon') {
        var e = CalcVsop(vsop.Earth, time);
        var m = Astronomy.GeoMoon(time);
        return new Vector(e.x+m.x, e.y+m.y, e.z+m.z, time);
    }
    if (body === 'EMB') {
        const e = CalcVsop(vsop.Earth, time);
        const m = Astronomy.GeoMoon(time);
        const denom = 1.0 + EARTH_MOON_MASS_RATIO;
        return new Vector(e.x+(m.x/denom), e.y+(m.y/denom), e.z+(m.z/denom), time);
    }
    if (body === 'SSB') {
        return CalcSolarSystemBarycenter(time);
    }
    throw `Astronomy.HelioVector: Unknown body "${body}"`;
};

/**
 * Calculates the distance between a body and the Sun at a given time.
 *
 * Given a date and time, this function calculates the distance between
 * the center of `body` and the center of the Sun.
 * For the planets Mercury through Neptune, this function is significantly
 * more efficient than calling {@link Astronomy.HelioVector} followed by taking the length
 * of the resulting vector.
 *
 * @param {string} body
 *      A body for which to calculate a heliocentric distance:
 *      the Sun, Moon, or any of the planets.
 *
 * @param {(Date | number | Astronomy.AstroTime)} date
 *      The date and time for which to calculate the heliocentric distance.
 *
 * @returns {number}
 *      The heliocentric distance in AU.
 */
Astronomy.HelioDistance = function(body, date) {
    const time = Astronomy.MakeTime(date);
    if (body in vsop) {
        return VsopFormula(vsop[body][RAD_INDEX], time.tt / DAYS_PER_MILLENNIUM);
    }
    return Astronomy.HelioVector(body, time).Length();
}

/**
 * Calculates geocentric (i.e., with respect to the center of the Earth)
 * Cartesian coordinates in the J2000 equatorial system of a celestial
 * body at a specified time. The position is always corrected for light travel time:
 * this means the position of the body is "back-dated" based on how long it
 * takes light to travel from the body to an observer on the Earth.
 * Also, the position can optionally be corrected for aberration, an effect
 * causing the apparent direction of the body to be shifted based on
 * transverse movement of the Earth with respect to the rays of light
 * coming from that body.
 *
 * @param {string} body
 *      One of the strings
 *      `"Sun"`, `"Moon"`, `"Mercury"`, `"Venus"`,
 *      `"Earth"`, `"Mars"`, `"Jupiter"`, `"Saturn"`,
 *      `"Uranus"`, `"Neptune"`, or `"Pluto"`.
 *
 * @param {(Date | number | Astronomy.AstroTime)} date
 *      The date and time for which the body's position is to be calculated.
 *
 * @param {bool} aberration
 *      Pass `true` to correct for
 *      <a href="https://en.wikipedia.org/wiki/Aberration_of_light">aberration</a>,
 *      or `false` to leave uncorrected.
 *
 * @returns {Astronomy.Vector}
 */
Astronomy.GeoVector = function(body, date, aberration) {
    VerifyBoolean(aberration);
    const time = Astronomy.MakeTime(date);
    if (body === 'Moon') {
        return Astronomy.GeoMoon(time);
    }
    if (body === 'Earth') {
        return new Vector(0, 0, 0, time);
    }

    let earth;
    if (!aberration) {
        // No aberration, so calculate Earth's position once, at the time of observation.
        earth = CalcVsop(vsop.Earth, time);
    }

    // Correct for light-travel time, to get position of body as seen from Earth's center.
    let h, geo, dt;
    let ltime = time;
    for (let iter=0; iter < 10; ++iter) {
        h = Astronomy.HelioVector(body, ltime);

        if (aberration) {
            /*
                Include aberration, so make a good first-order approximation
                by backdating the Earth's position also.
                This is confusing, but it works for objects within the Solar System
                because the distance the Earth moves in that small amount of light
                travel time (a few minutes to a few hours) is well approximated
                by a line segment that substends the angle seen from the remote
                body viewing Earth. That angle is pretty close to the aberration
                angle of the moving Earth viewing the remote body.
                In other words, both of the following approximate the aberration angle:
                    (transverse distance Earth moves) / (distance to body)
                    (transverse speed of Earth) / (speed of light).
            */
            earth = CalcVsop(vsop.Earth, ltime);
        }

        geo = new Vector(h.x-earth.x, h.y-earth.y, h.z-earth.z, time);
        let ltime2 = time.AddDays(-geo.Length() / C_AUDAY);
        dt = Math.abs(ltime2.tt - ltime.tt);
        if (dt < 1.0e-9) {
            return geo;
        }
        ltime = ltime2;
    }
    throw `Light-travel time solver did not converge: dt=${dt}`;
}

function QuadInterp(tm, dt, fa, fm, fb) {
    let Q = (fb + fa)/2 - fm;
    let R = (fb - fa)/2;
    let S = fm;
    let x;

    if (Q == 0) {
        // This is a line, not a parabola.
        if (R == 0) {
            // This is a HORIZONTAL line... can't make progress!
            return null;
        }
        x = -S / R;
        if (x < -1 || x > +1) return null;  // out of bounds
    } else {
        // It really is a parabola. Find roots x1, x2.
        let u = R*R - 4*Q*S;
        if (u <= 0) return null;
        let ru = Math.sqrt(u);
        let x1 = (-R + ru) / (2 * Q);
        let x2 = (-R - ru) / (2 * Q);

        if (-1 <= x1 && x1 <= +1) {
            if (-1 <= x2 && x2 <= +1) return null;
            x = x1;
        } else if (-1 <= x2 && x2 <= +1) {
            x = x2;
        } else {
            return null;
        }
    }

    let t = tm + x*dt;
    let df_dt = (2*Q*x + R) / dt;
    return { x:x, t:t, df_dt:df_dt };
}

/**
 * A continuous function of time used in a call to the `Search` function.
 *
 * @callback ContinuousFunction
 * @memberof Astronomy
 * @param {Astronomy.AstroTime} t        The time at which to evaluate the function.
 * @returns {number}
 */

/**
 * Options for the {@link Astronomy.Search} function.
 * @typedef {Object} SearchOptions
 * @memberof Astronomy
 *
 * @property {(number|null)} dt_tolerance_seconds
 *      The number of seconds for a time window smaller than which the search
 *      is considered successful.  Using too large a tolerance can result in
 *      an inaccurate time estimate.  Using too small a tolerance can cause
 *      excessive computation, or can even cause the search to fail because of
 *      limited floating-point resolution.  Defaults to 1 second.
 *
 * @property {(number|null)} init_f1
 *      As an optimization, if the caller of {@link Astronomy.Search}
 *      has already calculated the value of the function being searched (the parameter `func`)
 *      at the time coordinate `t1`, it can pass in that value as `init_f1`.
 *      For very expensive calculations, this can measurably improve performance.
 *
 * @property {(number|null)} init_f2
 *      The same as `init_f1`, except this is the optional initial value of `func(t2)`
 *      instead of `func(t1)`.
 */

/**
 * Search for next time <i>t</i> (such that <i>t</i> is between `t1` and `t2`)
 * that `func(t)` crosses from a negative value to a non-negative value.
 * The given function must have "smooth" behavior over the entire inclusive range [`t1`, `t2`],
 * meaning that it behaves like a continuous differentiable function.
 * It is not required that `t1` &lt; `t2`; `t1` &gt; `t2`
 * allows searching backward in time.
 * Note: `t1` and `t2` must be chosen such that there is no possibility
 * of more than one zero-crossing (ascending or descending), or it is possible
 * that the "wrong" event will be found (i.e. not the first event after t1)
 * or even that the function will return null, indicating that no event was found.
 *
 * @param {Astronomy.ContinuousFunction} func
 *      The function to find an ascending zero crossing for.
 *      The function must accept a single parameter of type {@link Astronomy.AstroTime}
 *      and return a numeric value.
 *
 * @param {Astronomy.AstroTime} t1
 *      The lower time bound of a search window.
 *
 * @param {Astronomy.AstroTime} t2
 *      The upper time bound of a search window.
 *
 * @param {(null | Astronomy.SearchOptions)} options
 *      Options that can tune the behavior of the search.
 *      Most callers can omit this argument or pass in `null`.
 *
 * @returns {(null | Astronomy.AstroTime)}
 *      If the search is successful, returns the date and time of the solution.
 *      If the search fails, returns null.
 */
Astronomy.Search = function(func, t1, t2, options) {
    const dt_tolerance_seconds = (options && options.dt_tolerance_seconds) || 1;

    function f(t) {
        return func(t);
    }

    const dt_days = Math.abs(dt_tolerance_seconds / SECONDS_PER_DAY);

    let f1 = (options && options.init_f1) || f(t1);
    let f2 = (options && options.init_f2) || f(t2);
    let fmid;

    let iter = 0;
    let iter_limit = (options && options.iter_limit) || 20;
    let calc_fmid = true;
    while (true) {
        if (++iter > iter_limit)
            throw `Excessive iteration in Search()`;

        let tmid = InterpolateTime(t1, t2, 0.5);
        let dt = tmid.ut - t1.ut;

        if (Math.abs(dt) < dt_days) {
            // We are close enough to the event to stop the search.
            return tmid;
        }

        if (calc_fmid)
            fmid = f(tmid);
        else
            calc_fmid = true;   // we already have the correct value of fmid from the previous loop

        // Quadratic interpolation:
        // Try to find a parabola that passes through the 3 points we have sampled:
        // (t1,f1), (tmid,fmid), (t2,f2).
        let q = QuadInterp(tmid.ut, t2.ut - tmid.ut, f1, fmid, f2);

        // Did we find an approximate root-crossing?
        if (q) {
            // Evaluate the function at our candidate solution.
            let tq = Astronomy.MakeTime(q.t);
            let fq = f(tq);

            if (q.df_dt !== 0) {
                if (Math.abs(fq / q.df_dt) < dt_days) {
                    // The estimated time error is small enough that we can quit now.
                    return tq;
                }

                // Try guessing a tighter boundary with the interpolated root at the center.
                let dt_guess = 1.2 * Math.abs(fq / q.df_dt);
                if (dt_guess < dt/10) {
                    let tleft = tq.AddDays(-dt_guess);
                    let tright = tq.AddDays(+dt_guess);
                    if ((tleft.ut - t1.ut)*(tleft.ut - t2.ut) < 0) {
                        if ((tright.ut - t1.ut)*(tright.ut - t2.ut) < 0) {
                            let fleft = f(tleft);
                            let fright = f(tright);
                            if (fleft<0 && fright>=0) {
                                f1 = fleft;
                                f2 = fright;
                                t1 = tleft;
                                t2 = tright;
                                fmid = fq;
                                calc_fmid = false;
                                continue;
                            }
                        }
                    }
                }
            }
        }

        if (f1<0 && fmid>=0) {
            t2 = tmid;
            f2 = fmid;
            continue;
        }

        if (fmid<0 && f2>=0) {
            t1 = tmid;
            f1 = fmid;
            continue;
        }

        // Either there is no ascending zero-crossing in this range
        // or the search window is too wide.
        return null;
    }
}

function LongitudeOffset(diff) {
    let offset = diff;
    while (offset <= -180) offset += 360;
    while (offset > 180) offset -= 360;
    return offset;
}

function NormalizeLongitude(lon) {
    while (lon < 0) lon += 360;
    while (lon >= 360) lon -= 360;
    return lon;
}

/**
 * Searches for the moment in time when the center of the Sun reaches a given apparent
 * ecliptic longitude, as seen from the center of the Earth, within a given range of dates.
 * This function can be used to determine equinoxes and solstices.
 * However, it is usually more convenient and efficient to call {@link Astronomy.Seasons}
 * to calculate equinoxes and solstices for a given calendar year.
 * `SearchSunLongitude` is more general in that it allows searching for arbitrary longitude values.
 *
 * @param {number} targetLon
 *      The desired ecliptic longitude of date in degrees.
 *      This may be any value in the range [0, 360), although certain
 *      values have conventional meanings:
 *
 *      When `targetLon` is 0, finds the March equinox,
 *      which is the moment spring begins in the northern hemisphere
 *      and the beginning of autumn in the southern hemisphere.
 *
 *      When `targetLon` is 180, finds the September equinox,
 *      which is the moment autumn begins in the northern hemisphere and
 *      spring begins in the southern hemisphere.
 *
 *      When `targetLon` is 90, finds the northern solstice, which is the
 *      moment summer begins in the northern hemisphere and winter
 *      begins in the southern hemisphere.
 *
 *      When `targetLon` is 270, finds the southern solstice, which is the
 *      moment winter begins in the northern hemisphere and summer
 *      begins in the southern hemisphere.
 *
 * @param {(Date | number | Astronomy.AstroTime)} dateStart
 *      A date and time known to be earlier than the desired longitude event.
 *
 * @param {number} limitDays
 *      A floating point number of days, which when added to `dateStart`,
 *      yields a date and time known to be after the desired longitude event.
 *
 * @returns {Astronomy.AstroTime | null}
 *      The date and time when the Sun reaches the apparent ecliptic longitude `targetLon`
 *      within the range of times specified by `dateStart` and `limitDays`.
 *      If the Sun does not reach the target longitude within the specified time range, or the
 *      time range is excessively wide, the return value is `null`.
 *      To avoid a `null` return value, the caller must pick a time window around
 *      the event that is within a few days but not so small that the event might fall outside the window.
 */
Astronomy.SearchSunLongitude = function(targetLon, dateStart, limitDays) {
    function sun_offset(t) {
        let pos = Astronomy.SunPosition(t);
        return LongitudeOffset(pos.elon - targetLon);
    }
    VerifyNumber(targetLon);
    VerifyNumber(limitDays);
    let t1 = Astronomy.MakeTime(dateStart);
    let t2 = t1.AddDays(limitDays);
    return Astronomy.Search(sun_offset, t1, t2);
}

/**
 * Calculates the ecliptic longitude difference
 * between the given body and the Sun as seen from
 * the Earth at a given moment in time.
 * The returned value ranges [0, 360) degrees.
 * By definition, the Earth and the Sun are both in the plane of the ecliptic.
 * Ignores the height of the `body` above or below the ecliptic plane;
 * the resulting angle is measured around the ecliptic plane for the "shadow"
 * of the body onto that plane.
 *
 * @param {string} body
 *      The name of a supported celestial body other than the Earth.
 *
 * @param {(Date|number|Astronomy.AstroTime)} date
 *      The time at which the relative longitude is to be found.
 *
 * @returns {number}
 *      An angle in degrees in the range [0, 360).
 *      Values less than 180 indicate that the body is to the east
 *      of the Sun as seen from the Earth; that is, the body sets after
 *      the Sun does and is visible in the evening sky.
 *      Values greater than 180 indicate that the body is to the west of
 *      the Sun and is visible in the morning sky.
 */
Astronomy.LongitudeFromSun = function(body, date) {
    if (body === 'Earth')
        throw 'The Earth does not have a longitude as seen from itself.';

    const t = Astronomy.MakeTime(date);
    let gb = Astronomy.GeoVector(body, t, false);
    const eb = Astronomy.Ecliptic(gb.x, gb.y, gb.z);

    let gs = Astronomy.GeoVector('Sun', t, false);
    const es = Astronomy.Ecliptic(gs.x, gs.y, gs.z);

    return NormalizeLongitude(eb.elon - es.elon);
}

/**
 * Returns the full angle seen from
 * the Earth, between the given body and the Sun.
 * Unlike {@link Astronomy.LongitudeFromSun}, this function does not
 * project the body's "shadow" onto the ecliptic;
 * the angle is measured in 3D space around the plane that
 * contains the centers of the Earth, the Sun, and `body`.
 *
 * @param {string} body
 *      The name of a supported celestial body other than the Earth.
 *
 * @param {(Date|number|Astronomy.AstroTime)} date
 *      The time at which the angle from the Sun is to be found.
 *
 * @returns {number}
 *      An angle in degrees in the range [0, 180].
 */
Astronomy.AngleFromSun = function(body, date) {
    if (body == 'Earth')
        throw 'The Earth does not have an angle as seen from itself.';

    let sv = Astronomy.GeoVector('Sun', date, true);
    let bv = Astronomy.GeoVector(body, date, true);
    let angle = AngleBetween(sv, bv);
    return angle;
}

/**
 * Calculates heliocentric ecliptic longitude based on the J2000 equinox.
 *
 * @param {string} body
 *      The name of a celestial body other than the Sun.
 *
 * @param {(Date | number | Astronomy.AstroTime)} date
 *      The date and time for which to calculate the ecliptic longitude.
 *
 * @returns {number}
 *      The ecliptic longitude angle of the body in degrees measured counterclockwise around the mean
 *      plane of the Earth's orbit, as seen from above the Sun's north pole.
 *      Ecliptic longitude starts at 0 at the J2000
 *      <a href="https://en.wikipedia.org/wiki/Equinox_(celestial_coordinates)">equinox</a> and
 *      increases in the same direction the Earth orbits the Sun.
 *      The returned value is always in the range [0, 360).
 */
Astronomy.EclipticLongitude = function(body, date) {
    if (body === 'Sun')
        throw 'Cannot calculate heliocentric longitude of the Sun.';

    let hv = Astronomy.HelioVector(body, date);
    let eclip = Astronomy.Ecliptic(hv.x, hv.y, hv.z);
    return eclip.elon;
}

function VisualMagnitude(body, phase, helio_dist, geo_dist) {
    // For Mercury and Venus, see:  https://iopscience.iop.org/article/10.1086/430212
    let c0, c1=0, c2=0, c3=0;
    switch (body) {
    case 'Mercury':     c0 = -0.60; c1 = +4.98; c2 = -4.88; c3 = +3.02; break;
    case 'Venus':
        if (phase < 163.6) {
            c0 = -4.47; c1 = +1.03; c2 = +0.57; c3 = +0.13;
        } else {
            c0 = 0.98; c1 = -1.02;
        }
        break;
    case 'Mars':        c0 = -1.52; c1 = +1.60;                         break;
    case 'Jupiter':     c0 = -9.40; c1 = +0.50;                         break;
    case 'Uranus':      c0 = -7.19; c1 = +0.25;                         break;
    case 'Neptune':     c0 = -6.87;                                     break;
    case 'Pluto':       c0 = -1.00; c1 = +4.00;                         break;
    default: throw `VisualMagnitude: unsupported body ${body}`;
    }

    const x = phase / 100;
    let mag = c0 + x*(c1 + x*(c2 + x*c3));
    mag += 5*Math.log10(helio_dist * geo_dist);
    return mag;
}

function SaturnMagnitude(phase, helio_dist, geo_dist, gc, time) {
    // Based on formulas by Paul Schlyter found here:
    // http://www.stjarnhimlen.se/comp/ppcomp.html#15

    // We must handle Saturn's rings as a major component of its visual magnitude.
    // Find geocentric ecliptic coordinates of Saturn.
    const eclip = Astronomy.Ecliptic(gc.x, gc.y, gc.z);
    const ir = DEG2RAD * 28.06;   // tilt of Saturn's rings to the ecliptic, in radians
    const Nr = DEG2RAD * (169.51 + (3.82e-5 * time.tt));    // ascending node of Saturn's rings, in radians

    // Find tilt of Saturn's rings, as seen from Earth.
    const lat = DEG2RAD * eclip.elat;
    const lon = DEG2RAD * eclip.elon;
    const tilt = Math.asin(Math.sin(lat)*Math.cos(ir) - Math.cos(lat)*Math.sin(ir)*Math.sin(lon-Nr));
    const sin_tilt = Math.sin(Math.abs(tilt));

    let mag = -9.0 + 0.044*phase;
    mag += sin_tilt*(-2.6 + 1.2*sin_tilt);
    mag += 5*Math.log10(helio_dist * geo_dist);
    return { mag:mag, ring_tilt:RAD2DEG*tilt };
}

function MoonMagnitude(phase, helio_dist, geo_dist) {
    // https://astronomy.stackexchange.com/questions/10246/is-there-a-simple-analytical-formula-for-the-lunar-phase-brightness-curve
    let rad = phase * DEG2RAD;
    let rad2 = rad * rad;
    let rad4 = rad2 * rad2;
    let mag = -12.717 + 1.49*Math.abs(rad) + 0.0431*rad4;

    const moon_mean_distance_au = 385000.6 / KM_PER_AU;
    let geo_au = geo_dist / moon_mean_distance_au;
    mag += 5*Math.log10(helio_dist * geo_au);
    return mag;
}

/**
 * Contains information about the apparent brightness and sunlit phase of a celestial object.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {Astronomy.AstroTime} time
 *      The date and time pertaining to the other calculated values in this object.
 *
 * @property {number} mag
 *      The <a href="https://en.wikipedia.org/wiki/Apparent_magnitude">apparent visual magnitude</a> of the celestial body.
 *
 * @property {number} phase_angle
 *      The angle in degrees as seen from the center of the celestial body between the Sun and the Earth.
 *      The value is always in the range 0 to 180.
 *      The phase angle provides a measure of what fraction of the body's face appears
 *      illuminated by the Sun as seen from the Earth.
 *      When the observed body is the Sun, the `phase` property is set to 0,
 *      although this has no physical meaning because the Sun emits, rather than reflects, light.
 *      When the phase is near 0 degrees, the body appears "full".
 *      When it is 90 degrees, the body appears "half full".
 *      And when it is 180 degrees, the body appears "new" and is very difficult to see
 *      because it is both dim and lost in the Sun's glare as seen from the Earth.
 *
 * @property {number} phase_fraction
 *      The fraction of the body's face that is illuminated by the Sun, as seen from the Earth.
 *      Calculated from `phase_angle` for convenience.
 *      This value ranges from 0 to 1.
 *
 * @property {number} helio_dist
 *      The distance between the center of the Sun and the center of the body in
 *      <a href="https://en.wikipedia.org/wiki/Astronomical_unit">astronomical units</a> (AU).
 *
 * @property {number} geo_dist
 *      The distance between the center of the Earth and the center of the body in AU.
 *
 * @property {Astronomy.Vector} gc
 *      Geocentric coordinates: the 3D vector from the center of the Earth to the center of the body.
 *      The components are in expressed in AU and are oriented with respect to the J2000 equatorial plane.
 *
 * @property {Astronomy.Vector} hc
 *      Heliocentric coordinates: The 3D vector from the center of the Sun to the center of the body.
 *      Like `gc`, `hc` is expressed in AU and oriented with respect
 *      to the J2000 equatorial plane.
 *
 * @property {number | null} ring_tilt
 *      For Saturn, this is the angular tilt of the planet's rings in degrees away
 *      from the line of sight from the Earth. When the value is near 0, the rings
 *      appear edge-on from the Earth and are therefore difficult to see.
 *      When `ring_tilt` approaches its maximum value (about 27 degrees),
 *      the rings appear widest and brightest from the Earth.
 *      Unlike the <a href="https://ssd.jpl.nasa.gov/horizons.cgi">JPL Horizons</a> online tool,
 *      this library includes the effect of the ring tilt angle in the calculated value
 *      for Saturn's visual magnitude.
 *      For all bodies other than Saturn, the value of `ring_tilt` is `null`.
 */
class IlluminationInfo {
    constructor(time, mag, phase, helio_dist, geo_dist, gc, hc, ring_tilt) {
        this.time = time;
        this.mag = mag;
        this.phase_angle = phase;
        this.phase_fraction = (1 + Math.cos(DEG2RAD * phase)) / 2;
        this.helio_dist = helio_dist;
        this.geo_dist = geo_dist;
        this.gc = gc;
        this.hc = hc;
        this.ring_tilt = ring_tilt;
    }
}

/**
 * Calculates the phase angle, visual maginitude,
 * and other values relating to the body's illumination
 * at the given date and time, as seen from the Earth.
 *
 * @param {string} body
 *      The name of the celestial body being observed.
 *      Not allowed to be `"Earth"`.
 *
 * @param {Date | number | Astronomy.AstroTime} date
 *      The date and time for which to calculate the illumination data for the given body.
 *
 * @returns {Astronomy.IlluminationInfo}
 */
Astronomy.Illumination = function(body, date) {
    if (body === 'Earth')
        throw `The illumination of the Earth is not defined.`;

    const time = Astronomy.MakeTime(date);
    const earth = CalcVsop(vsop.Earth, time);
    let phase;      // phase angle in degrees between Earth and Sun as seen from body
    let hc;         // vector from Sun to body
    let gc;         // vector from Earth to body
    let mag;        // visual magnitude

    if (body === 'Sun') {
        gc = new Vector(-earth.x, -earth.y, -earth.z, time);
        hc = new Vector(0, 0, 0, time);
        phase = 0;      // a placeholder value; the Sun does not have an illumination phase because it emits, rather than reflects, light.
    } else {
        if (body === 'Moon') {
            // For extra numeric precision, use geocentric moon formula directly.
            gc = Astronomy.GeoMoon(time);
            hc = new Vector(earth.x + gc.x, earth.y + gc.y, earth.z + gc.z, time);
        } else {
            // For planets, heliocentric vector is most direct to calculate.
            hc = Astronomy.HelioVector(body, date);
            gc = new Vector(hc.x - earth.x, hc.y - earth.y, hc.z - earth.z, time);
        }
        phase = AngleBetween(gc, hc);
    }

    let geo_dist = gc.Length();     // distance from body to center of Earth
    let helio_dist = hc.Length();   // distance from body to center of Sun
    let ring_tilt = null;   // only reported for Saturn

    if (body === 'Sun') {
        mag = SUN_MAG_1AU + 5*Math.log10(geo_dist);
    } else if (body === 'Moon') {
        mag = MoonMagnitude(phase, helio_dist, geo_dist);
    } else if (body === 'Saturn') {
        const saturn = SaturnMagnitude(phase, helio_dist, geo_dist, gc, time);
        mag = saturn.mag;
        ring_tilt = saturn.ring_tilt;
    } else {
        mag = VisualMagnitude(body, phase, helio_dist, geo_dist);
    }

    return new IlluminationInfo(time, mag, phase, helio_dist, geo_dist, gc, hc, ring_tilt);
}

function SynodicPeriod(body) {
    if (body === 'Earth')
        throw 'The Earth does not have a synodic period as seen from itself.';

    if (body === 'Moon')
        return MEAN_SYNODIC_MONTH;

    // Calculate the synodic period of the planet from its and the Earth's sidereal periods.
    // The sidereal period of a planet is how long it takes to go around the Sun in days, on average.
    // The synodic period of a planet is how long it takes between consecutive oppositions
    // or conjunctions, on average.

    let planet = Planet[body];
    if (!planet)
        throw `Not a valid planet name: ${body}`;

    // See here for explanation of the formula:
    // https://en.wikipedia.org/wiki/Elongation_(astronomy)#Elongation_period

    const Te = Planet.Earth.OrbitalPeriod;
    const Tp = planet.OrbitalPeriod;
    const synodicPeriod = Math.abs(Te / (Te/Tp - 1));

    return synodicPeriod;
}

/**
 * Searches for the date and time the relative ecliptic longitudes of
 * the specified body and the Earth, as seen from the Sun, reach a certain
 * difference. This function is useful for finding conjunctions and oppositions
 * of the planets. For the opposition of a superior planet (Mars, Jupiter, ..., Pluto),
 * or the inferior conjunction of an inferior planet (Mercury, Venus),
 * call with `targetRelLon` = 0. The 0 value indicates that both
 * planets are on the same ecliptic longitude line, ignoring the other planet's
 * distance above or below the plane of the Earth's orbit.
 * For superior conjunctions, call with `targetRelLon` = 180.
 * This means the Earth and the other planet are on opposite sides of the Sun.
 *
 * @param {string} body
 *      The name of a planet other than the Earth.
 *
 * @param {number} targetRelLon
 *      The desired angular difference in degrees between the ecliptic longitudes
 *      of `body` and the Earth. Must be in the range (-180, +180].
 *
 * @param {(Date | number | Astronomy.AstroTime)} startDate
 *      The date and time after which to find the next occurrence of the
 *      body and the Earth reaching the desired relative longitude.
 *
 * @returns {Astronomy.AstroTime}
 *      The time when the Earth and the body next reach the specified relative longitudes.
 */
Astronomy.SearchRelativeLongitude = function(body, targetRelLon, startDate) {
    VerifyNumber(targetRelLon);
    const planet = Planet[body];
    if (!planet)
        throw `Cannot search relative longitude because body is not a planet: ${body}`;

    if (body === 'Earth')
        throw 'Cannot search relative longitude for the Earth (it is always 0)';

    // Determine whether the Earth "gains" (+1) on the planet or "loses" (-1)
    // as both race around the Sun.
    const direction = (planet.OrbitalPeriod > Planet.Earth.OrbitalPeriod) ? +1 : -1;

    function offset(t) {
        const plon = Astronomy.EclipticLongitude(body, t);
        const elon = Astronomy.EclipticLongitude('Earth', t);
        const diff = direction * (elon - plon);
        return LongitudeOffset(diff - targetRelLon);
    }

    let syn = SynodicPeriod(body);
    let time = Astronomy.MakeTime(startDate);

    // Iterate until we converge on the desired event.
    // Calculate the error angle, which will be a negative number of degrees,
    // meaning we are "behind" the target relative longitude.
    let error_angle = offset(time);
    if (error_angle > 0) error_angle -= 360;    // force searching forward in time

    for (let iter=0; iter < 100; ++iter) {
        // Estimate how many days in the future (positive) or past (negative)
        // we have to go to get closer to the target relative longitude.
        let day_adjust = (-error_angle/360) * syn;
        time = time.AddDays(day_adjust);
        if (Math.abs(day_adjust) * SECONDS_PER_DAY < 1)
            return time;

        let prev_angle = error_angle;
        error_angle = offset(time);

        if (Math.abs(prev_angle) < 30) {
            // Improve convergence for Mercury/Mars (eccentric orbits)
            // by adjusting the synodic period to more closely match the
            // variable speed of both planets in this part of their respective orbits.
            if (prev_angle !== error_angle) {
                let ratio = prev_angle / (prev_angle - error_angle);
                if (ratio > 0.5 && ratio < 2.0)
                    syn *= ratio;
            }
        }
    }

    throw `Relative longitude search failed to converge for ${body} near ${time.toString()} (error_angle = ${error_angle}).`;
}

/**
 * Determines the moon's phase expressed as an ecliptic longitude.
 *
 * @param {Date | number | Astronomy.AstroTime} date
 *      The date and time for which to calculate the moon's phase.
 *
 * @returns {number}
 *      A value in the range [0, 360) indicating the difference
 *      in ecliptic longitude between the center of the Sun and the
 *      center of the Moon, as seen from the center of the Earth.
 *      Certain longitude values have conventional meanings:
 *
 * * 0 = new moon
 * * 90 = first quarter
 * * 180 = full moon
 * * 270 = third quarter
 */
Astronomy.MoonPhase = function(date) {
    return Astronomy.LongitudeFromSun('Moon', date);
}

/**
 * Searches for the date and time that the Moon reaches a specified phase.
 * Lunar phases are defined in terms of geocentric ecliptic longitudes
 * with respect to the Sun.  When the Moon and the Sun have the same ecliptic
 * longitude, that is defined as a new moon. When the two ecliptic longitudes
 * are 180 degrees apart, that is defined as a full moon.
 * To enumerate quarter lunar phases, it is simpler to call
 * {@link Astronomy.SearchMoonQuarter} once, followed by repeatedly calling
 * {@link Astronomy.NextMoonQuarter}. `SearchMoonPhase` is only
 * necessary for finding other lunar phases than the usual quarter phases.
 *
 * @param {number} targetLon
 *      The difference in geocentric ecliptic longitude between the Sun and Moon
 *      that specifies the lunar phase being sought. This can be any value
 *      in the range [0, 360). Here are some helpful examples:
 *      0 = new moon,
 *      90 = first quarter,
 *      180 = full moon,
 *      270 = third quarter.
 *
 * @param {(Date|number|Astronomy.AstroTime)} dateStart
 *      The beginning of the window of time in which to search.
 *
 * @param {number} limitDays
 *      The floating point number of days after `dateStart`
 *      that limits the window of time in which to search.
 *
 * @returns {(Astronomy.AstroTime|null)}
 *      If the specified lunar phase occurs after `dateStart`
 *      and before `limitDays` days after `dateStart`,
 *      this function returns the date and time of the first such occurrence.
 *      Otherwise, it returns `null`.
 */
Astronomy.SearchMoonPhase = function(targetLon, dateStart, limitDays) {
    function moon_offset(t) {
        let mlon = Astronomy.MoonPhase(t);
        return LongitudeOffset(mlon - targetLon);
    }

    VerifyNumber(targetLon);
    VerifyNumber(limitDays);

    // To avoid discontinuities in the moon_offset function causing problems,
    // we need to approximate when that function will next return 0.
    // We probe it with the start time and take advantage of the fact
    // that every lunar phase repeats roughly every 29.5 days.
    // There is a surprising uncertainty in the quarter timing,
    // due to the eccentricity of the moon's orbit.
    // I have seen more than 0.9 days away from the simple prediction.
    // To be safe, we take the predicted time of the event and search
    // +/-1.5 days around it (a 3.0-day wide window).
    // But we must return null if the final result goes beyond limitDays after dateStart.
    const uncertainty = 1.5;

    let ta = Astronomy.MakeTime(dateStart);
    let ya = moon_offset(ta);
    if (ya > 0) ya -= 360;  // force searching forward in time, not backward
    let est_dt = -(MEAN_SYNODIC_MONTH*ya)/360;
    let dt1 = est_dt - uncertainty;
    if (dt1 > limitDays) return null;   // not possible for moon phase to occur within the specified window
    let dt2 = Math.min(limitDays, est_dt + uncertainty);
    let t1 = ta.AddDays(dt1);
    let t2 = ta.AddDays(dt2);
    return Astronomy.Search(moon_offset, t1, t2);
}

/**
 * Represents a quarter lunar phase, along with when it occurs.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {number} quarter
 *      An integer as follows:
 *      0 = new moon,
 *      1 = first quarter,
 *      2 = full moon,
 *      3 = third quarter.
 *
 * @property {Astronomy.AstroTime} time
 *      The date and time of the quarter lunar phase.
 */
class MoonQuarter {
    constructor(quarter, time) {
        this.quarter = quarter;
        this.time = time;
    }
}

/**
 * Finds the first quarter lunar phase after the specified date and time.
 * The quarter lunar phases are: new moon, first quarter, full moon, and third quarter.
 * To enumerate quarter lunar phases, call `SearchMoonQuarter` once,
 * then pass its return value to {@link Astronomy.NextMoonQuarter} to find the next
 * `MoonQuarter`. Keep calling `NextMoonQuarter` in a loop,
 * passing the previous return value as the argument to the next call.
 *
 * @param {(Date|number|Astronomy.AstroTime)} dateStart
 *      The date and time after which to find the first quarter lunar phase.
 *
 * @returns {Astronomy.MoonQuarter}
 */
Astronomy.SearchMoonQuarter = function(dateStart) {
    // Determine what the next quarter phase will be.
    let phaseStart = Astronomy.MoonPhase(dateStart);
    let quarterStart = Math.floor(phaseStart / 90);
    let quarter = (quarterStart + 1) % 4;
    let time = Astronomy.SearchMoonPhase(90 * quarter, dateStart, 10);
    return time && new MoonQuarter(quarter, time);
}

/**
 * Given a {@link Astronomy.MoonQuarter} object, finds the next consecutive
 * quarter lunar phase. See remarks in {@link Astronomy.SearchMoonQuarter}
 * for explanation of usage.
 *
 * @param {Astronomy.MoonQuarter} mq
 *      The return value of a prior call to {@link Astronomy.MoonQuarter} or `NextMoonQuarter`.
 */
Astronomy.NextMoonQuarter = function(mq) {
    // Skip 6 days past the previous found moon quarter to find the next one.
    // This is less than the minimum possible increment.
    // So far I have seen the interval well contained by the range (6.5, 8.3) days.
    let date = new Date(mq.time.date.getTime() + 6*MILLIS_PER_DAY);
    return Astronomy.SearchMoonQuarter(date);
}

/**
 * Finds a rise or set time for the given body as
 * seen by an observer at the specified location on the Earth.
 * Rise time is defined as the moment when the top of the body
 * is observed to first appear above the horizon in the east.
 * Set time is defined as the moment the top of the body
 * is observed to sink below the horizon in the west.
 * The times are adjusted for typical atmospheric refraction conditions.
 *
 * @param {string} body
 *      The name of the body to find the rise or set time for.
 *
 * @param {Astronomy.Observer} observer
 *      Specifies the geographic coordinates and elevation above sea level of the observer.
 *      Call {@link Astronomy.MakeObserver} to create an observer object.
 *
 * @param {number} direction
 *      Either +1 to find rise time or -1 to find set time.
 *      Any other value will cause an exception to be thrown.
 *
 * @param {(Date|number|Astronomy.AstroTime)} dateStart
 *      The date and time after which the specified rise or set time is to be found.
 *
 * @param {number} limitDays
 *      The fractional number of days after `dateStart` that limits
 *      when the rise or set time is to be found.
 *
 * @returns {(Astronomy.AstroTime|null)}
 *      The date and time of the rise or set event, or null if no such event
 *      occurs within the specified time window.
 */
Astronomy.SearchRiseSet = function(body, observer, direction, dateStart, limitDays) {
    VerifyObserver(observer);
    VerifyNumber(limitDays);

    // We calculate the apparent angular radius of the Sun and Moon,
    // but treat all other bodies as points.
    let body_radius_au = { Sun:SUN_RADIUS_AU, Moon:MOON_EQUATORIAL_RADIUS_AU }[body] || 0;

    function peak_altitude(t) {
        // Return the angular altitude above or below the horizon
        // of the highest part (the peak) of the given object.
        // This is defined as the apparent altitude of the center of the body plus
        // the body's angular radius.
        // The 'direction' variable in the enclosing function controls
        // whether the angle is measured positive above the horizon or
        // positive below the horizon, depending on whether the caller
        // wants rise times or set times, respectively.

        const ofdate = Astronomy.Equator(body, t, observer, true, true);
        const hor = Astronomy.Horizon(t, observer, ofdate.ra, ofdate.dec);
        const alt = hor.altitude + RAD2DEG*(body_radius_au / ofdate.dist) + REFRACTION_NEAR_HORIZON;
        return direction * alt;
    }

    if (body === 'Earth')
        throw 'Cannot find rise or set time of the Earth.';

    // See if the body is currently above/below the horizon.
    // If we are looking for next rise time and the body is below the horizon,
    // we use the current time as the lower time bound and the next culmination
    // as the upper bound.
    // If the body is above the horizon, we search for the next bottom and use it
    // as the lower bound and the next culmination after that bottom as the upper bound.
    // The same logic applies for finding set times, only we swap the hour angles.
    // The peak_altitude() function already considers the 'direction' parameter.

    let ha_before, ha_after;
    if (direction === +1) {
        ha_before = 12;     // minimum altitude (bottom) happens BEFORE the body rises.
        ha_after = 0;       // maximum altitude (culmination) happens AFTER the body rises.
    } else if (direction === -1) {
        ha_before = 0;      // culmination happens BEFORE the body sets.
        ha_after = 12;      // bottom happens AFTER the body sets.
    } else {
        throw `Astronomy.SearchRiseSet: Invalid direction parameter ${direction} -- must be +1 or -1`;
    }

    let time_start = Astronomy.MakeTime(dateStart);
    let time_before;
    let evt_before, evt_after;
    let alt_before = peak_altitude(time_start);
    let alt_after;
    if (alt_before > 0) {
        // We are past the sought event, so we have to wait for the next "before" event (culm/bottom).
        evt_before = Astronomy.SearchHourAngle(body, observer, ha_before, time_start);
        time_before = evt_before.time;
        alt_before = peak_altitude(time_before);
    } else {
        // We are before or at the sought event, so we find the next "after" event (bottom/culm),
        // and use the current time as the "before" event.
        time_before = time_start;
    }
    evt_after = Astronomy.SearchHourAngle(body, observer, ha_after, time_before);
    alt_after = peak_altitude(evt_after.time);

    while (true) {
        if (alt_before <= 0 && alt_after > 0) {
            // Search between evt_before and evt_after for the desired event.
            let tx = Astronomy.Search(peak_altitude, time_before, evt_after.time, {init_f1:alt_before, init_f2:alt_after});
            if (tx)
                return tx;
        }

        // If we didn't find the desired event, use time_after to find the next before-event.
        evt_before = Astronomy.SearchHourAngle(body, observer, ha_before, evt_after.time);
        evt_after = Astronomy.SearchHourAngle(body, observer, ha_after, evt_before.time);
        if (evt_before.time.ut >= time_start.ut + limitDays)
            return null;

        time_before = evt_before.time;
        alt_before = peak_altitude(evt_before.time);
        alt_after = peak_altitude(evt_after.time);
    }
}

/**
 * Returns information about an occurrence of a celestial body
 * reaching a given hour angle as seen by an observer at a given
 * location on the surface of the Earth.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {Astronomy.AstroTime} time
 *      The date and time of the celestial body reaching the hour angle.
 *
 * @property {Astronomy.HorizontalCoordinates} hor
 *      Topocentric horizontal coordinates for the body
 *      at the time indicated by the `time` property.
 */
class HourAngleEvent {
    constructor(time, hor) {
        this.time = time;
        this.hor = hor;
    }
}

/**
 * Finds the next time the given body is seen to reach the specified
 * <a href="https://en.wikipedia.org/wiki/Hour_angle">hour angle</a>
 * by the given observer.
 * Providing `hourAngle` = 0 finds the next maximum altitude event (culmination).
 * Providing `hourAngle` = 12 finds the next minimum altitude event.
 * Note that, especially close to the Earth's poles, a body as seen on a given day
 * may always be above the horizon or always below the horizon, so the caller cannot
 * assume that a culminating object is visible nor that an object is below the horizon
 * at its minimum altitude.
 *
 * @param {string} body
 *      The name of a celestial body other than the Earth.
 *
 * @param {Astronomy.Observer} observer
 *      Specifies the geographic coordinates and elevation above sea level of the observer.
 *      Call {@link Astronomy.MakeObserver} to create an observer object.
 *
 * @param {number} hourAngle
 *      The hour angle expressed in
 *      <a href="https://en.wikipedia.org/wiki/Sidereal_time">sidereal</a>
 *      hours for which the caller seeks to find the body attain.
 *      The value must be in the range [0, 24).
 *      The hour angle represents the number of sidereal hours that have
 *      elapsed since the most recent time the body crossed the observer's local
 *      <a href="https://en.wikipedia.org/wiki/Meridian_(astronomy)">meridian</a>.
 *      This specifying `hourAngle` = 0 finds the moment in time
 *      the body reaches the highest angular altitude in a given sidereal day.
 *
 * @param {(Date|number|Astronomy.AstroTime)} dateStart
 *      The date and time after which the desired hour angle crossing event
 *      is to be found.
 *
 * @returns {Astronomy.HourAngleEvent}
 */
Astronomy.SearchHourAngle = function(body, observer, hourAngle, dateStart) {
    VerifyObserver(observer);
    let time = Astronomy.MakeTime(dateStart);
    let iter = 0;

    if (body === 'Earth')
        throw 'Cannot search for hour angle of the Earth.';

    VerifyNumber(hourAngle);
    if (hourAngle < 0.0 || hourAngle >= 24.0)
        throw `Invalid hour angle ${hourAngle}`;

    while (true) {
        ++iter;

        // Calculate Greenwich Apparent Sidereal Time (GAST) at the given time.
        let gast = sidereal_time(time);

        let ofdate = Astronomy.Equator(body, time, observer, true, true);

        // Calculate the adjustment needed in sidereal time to bring
        // the hour angle to the desired value.
        let delta_sidereal_hours = ((hourAngle + ofdate.ra - observer.longitude/15) - gast) % 24;
        if (iter === 1) {
            // On the first iteration, always search forward in time.
            if (delta_sidereal_hours < 0)
                delta_sidereal_hours += 24;
        } else {
            // On subsequent iterations, we make the smallest possible adjustment,
            // either forward or backward in time.
            if (delta_sidereal_hours < -12)
                delta_sidereal_hours += 24;
            else if (delta_sidereal_hours > +12)
                delta_sidereal_hours -= 24;
        }

        // If the error is tolerable (less than 0.1 seconds), stop searching.
        if (Math.abs(delta_sidereal_hours) * 3600 < 0.1) {
            const hor = Astronomy.Horizon(time, observer, ofdate.ra, ofdate.dec, 'normal');
            return new HourAngleEvent(time, hor);
        }

        // We need to loop another time to get more accuracy.
        // Update the terrestrial time adjusting by sidereal time.
        let delta_days = (delta_sidereal_hours / 24) * SOLAR_DAYS_PER_SIDEREAL_DAY;
        time = time.AddDays(delta_days);
    }
}

/**
 * Represents the dates and times of the two solstices
 * and the two equinoxes in a given calendar year.
 * These four events define the changing of the seasons on the Earth.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {Astronomy.AstroTime} mar_equinox
 *      The date and time of the March equinox in the given calendar year.
 *      This is the moment in March that the plane of the Earth's equator passes
 *      through the center of the Sun; thus the Sun's declination
 *      changes from a negative number to a positive number.
 *      The March equinox defines
 *      the beginning of spring in the northern hemisphere and
 *      the beginning of autumn in the southern hemisphere.
 *
 * @property {Astronomy.AstroTime} jun_solstice
 *      The date and time of the June solstice in the given calendar year.
 *      This is the moment in June that the Sun reaches its most positive
 *      declination value.
 *      At this moment the Earth's north pole is most tilted most toward the Sun.
 *      The June solstice defines
 *      the beginning of summer in the northern hemisphere and
 *      the beginning of winter in the southern hemisphere.
 *
 * @property {Astronomy.AstroTime} sep_equinox
 *      The date and time of the September equinox in the given calendar year.
 *      This is the moment in September that the plane of the Earth's equator passes
 *      through the center of the Sun; thus the Sun's declination
 *      changes from a positive number to a negative number.
 *      The September equinox defines
 *      the beginning of autumn in the northern hemisphere and
 *      the beginning of spring in the southern hemisphere.
 *
 * @property {Astronomy.AstroTime} dec_solstice
 *      The date and time of the December solstice in the given calendar year.
 *      This is the moment in December that the Sun reaches its most negative
 *      declination value.
 *      At this moment the Earth's south pole is tilted most toward the Sun.
 *      The December solstice defines
 *      the beginning of winter in the northern hemisphere and
 *      the beginning of summer in the southern hemisphere.
 */
class SeasonInfo {
    constructor(mar_equinox, jun_solstice, sep_equinox, dec_solstice) {
        this.mar_equinox = mar_equinox;
        this.jun_solstice = jun_solstice;
        this.sep_equinox = sep_equinox;
        this.dec_solstice = dec_solstice;
    }
}

/**
 * Finds the equinoxes and solstices for a given calendar year.
 *
 * @param {(number | Astronomy.AstroTime)} year
 *      The integer value or `AstroTime` object that specifies
 *      the UTC calendar year for which to find equinoxes and solstices.
 *
 * @returns {Astronomy.SeasonInfo}
 */
Astronomy.Seasons = function(year) {
    function find(targetLon, month, day) {
        let startDate = new Date(Date.UTC(year, month-1, day));
        let time = Astronomy.SearchSunLongitude(targetLon, startDate, 4);
        if (!time)
            throw `Cannot find season change near ${startDate.toISOString()}`;
        return time;
    }

    if (IsValidDate(year)) {
        year = year.getUTCFullYear();
    }

    if (!Number.isSafeInteger(year)) {
        throw `Cannot calculate seasons because year argument ${year} is neither a Date nor a safe integer.`;
    }

    let mar_equinox  = find(  0,  3, 19);
    let jun_solstice = find( 90,  6, 19);
    let sep_equinox  = find(180,  9, 21);
    let dec_solstice = find(270, 12, 20);

    return new SeasonInfo(mar_equinox, jun_solstice, sep_equinox, dec_solstice);
}

/**
 * Represents the angular separation of a body from the Sun as seen from the Earth
 * and the relative ecliptic longitudes between that body and the Earth as seen from the Sun.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {Astronomy.AstroTime} time
 *      The date and time of the observation.
 *
 * @property {string}  visibility
 *      Either `"morning"` or `"evening"`,
 *      indicating when the body is most easily seen.
 *
 * @property {number}  elongation
 *      The angle in degrees, as seen from the center of the Earth,
 *      of the apparent separation between the body and the Sun.
 *      This angle is measured in 3D space and is not projected onto the ecliptic plane.
 *      When `elongation` is less than a few degrees, the body is very
 *      difficult to see from the Earth because it is lost in the Sun's glare.
 *      The elongation is always in the range [0, 180].
 *
 * @property {number}  ecliptic_separation
 *      The absolute value of the difference between the body's ecliptic longitude
 *      and the Sun's ecliptic longitude, both as seen from the center of the Earth.
 *      This angle measures around the plane of the Earth's orbit (the ecliptic),
 *      and ignores how far above or below that plane the body is.
 *      The ecliptic separation is measured in degrees and is always in the range [0, 180].
 *
 * @see {@link Astronomy.Elongation}
 */
class ElongationEvent {
    constructor(time, visibility, elongation, ecliptic_separation) {
        this.time = time;
        this.visibility = visibility;
        this.elongation = elongation;
        this.ecliptic_separation = ecliptic_separation;
    }
}

/**
 * Calculates angular separation of a body from the Sun as seen from the Earth
 * and the relative ecliptic longitudes between that body and the Earth as seen from the Sun.
 * See the return type {@link Astronomy.ElongationEvent} for details.
 *
 * This function is helpful for determining how easy
 * it is to view a planet away from the Sun's glare on a given date.
 * It also determines whether the object is visible in the morning or evening;
 * this is more important the smaller the elongation is.
 * It is also used to determine how far a planet is from opposition, conjunction, or quadrature.
 *
 * @param {string} body
 *      The name of the observed body. Not allowed to be `"Earth"`.
 *
 * @returns {Astronomy.ElongationEvent}
 */
Astronomy.Elongation = function(body, date) {
    let time = Astronomy.MakeTime(date);

    let lon = Astronomy.LongitudeFromSun(body, time);
    let vis;
    if (lon > 180) {
        vis = 'morning';
        lon = 360 - lon;
    } else {
        vis = 'evening';
    }
    let angle = Astronomy.AngleFromSun(body, time);
    return new ElongationEvent(time, vis, angle, lon);
}

/**
 * Searches for the next maximum elongation event for Mercury or Venus
 * that occurs after the given start date. Calling with other values
 * of `body` will result in an exception.
 * Maximum elongation occurs when the body has the greatest
 * angular separation from the Sun, as seen from the Earth.
 * Returns an `ElongationEvent` object containing the date and time of the next
 * maximum elongation, the elongation in degrees, and whether
 * the body is visible in the morning or evening.
 *
 * @param {string} body     Either `"Mercury"` or `"Venus"`.
 * @param {Date} startDate  The date and time after which to search for the next maximum elongation event.
 *
 * @returns {Astronomy.ElongationEvent}
 */
Astronomy.SearchMaxElongation = function(body, startDate) {
    const dt = 0.01;

    function neg_slope(t) {
        // The slope de/dt goes from positive to negative at the maximum elongation event.
        // But Search() is designed for functions that ascend through zero.
        // So this function returns the negative slope.
        const t1 = t.AddDays(-dt/2);
        const t2 = t.AddDays(+dt/2);
        let e1 = Astronomy.AngleFromSun(body, t1);
        let e2 = Astronomy.AngleFromSun(body, t2);
        let m = (e1-e2)/dt;
        return m;
    }

    let startTime = Astronomy.MakeTime(startDate);

    const table = {
        Mercury : { s1:50.0, s2:85.0 },
        Venus :   { s1:40.0, s2:50.0 }
    };

    const planet = table[body];
    if (!planet)
        throw 'SearchMaxElongation works for Mercury and Venus only.';

    let iter = 0;
    while (++iter <= 2) {
        // Find current heliocentric relative longitude between the
        // inferior planet and the Earth.
        let plon = Astronomy.EclipticLongitude(body, startTime);
        let elon = Astronomy.EclipticLongitude('Earth', startTime);
        let rlon = LongitudeOffset(plon - elon);    // clamp to (-180, +180]

        // The slope function is not well-behaved when rlon is near 0 degrees or 180 degrees
        // because there is a cusp there that causes a discontinuity in the derivative.
        // So we need to guard against searching near such times.

        let t1, t2;
        let rlon_lo, rlon_hi, adjust_days;
        if (rlon >= -planet.s1 && rlon < +planet.s1 ) {
            // Seek to the window [+s1, +s2].
            adjust_days = 0;
            // Search forward for the time t1 when rel lon = +s1.
            rlon_lo = +planet.s1;
            // Search forward for the time t2 when rel lon = +s2.
            rlon_hi = +planet.s2;
        } else if (rlon >= +planet.s2 || rlon < -planet.s2 ) {
            // Seek to the next search window at [-s2, -s1].
            adjust_days = 0;
            // Search forward for the time t1 when rel lon = -s2.
            rlon_lo = -planet.s2;
            // Search forward for the time t2 when rel lon = -s1.
            rlon_hi = -planet.s1;
        } else if (rlon >= 0) {
            // rlon must be in the middle of the window [+s1, +s2].
            // Search BACKWARD for the time t1 when rel lon = +s1.
            adjust_days = -SynodicPeriod(body) / 4;
            rlon_lo = +planet.s1;
            rlon_hi = +planet.s2;
            // Search forward from t1 to find t2 such that rel lon = +s2.
        } else {
            // rlon must be in the middle of the window [-s2, -s1].
            // Search BACKWARD for the time t1 when rel lon = -s2.
            adjust_days = -SynodicPeriod(body) / 4;
            rlon_lo = -planet.s2;
            // Search forward from t1 to find t2 such that rel lon = -s1.
            rlon_hi = -planet.s1;
        }

        let t_start = startTime.AddDays(adjust_days);
        t1 = Astronomy.SearchRelativeLongitude(body, rlon_lo, t_start);
        t2 = Astronomy.SearchRelativeLongitude(body, rlon_hi, t1);

        // Now we have a time range [t1,t2] that brackets a maximum elongation event.
        // Confirm the bracketing.
        let m1 = neg_slope(t1);
        if (m1 >= 0)
            throw `SearchMaxElongation: internal error: m1 = ${m1}`;

        let m2 = neg_slope(t2);
        if (m2 <= 0)
            throw `SearchMaxElongation: internal error: m2 = ${m2}`;

        // Use the generic search algorithm to home in on where the slope crosses from negative to positive.
        let tx = Astronomy.Search(neg_slope, t1, t2, {init_f1:m1, init_f2:m2, dt_tolerance_seconds:10});
        if (!tx)
            throw `SearchMaxElongation: failed search iter ${iter} (t1=${t1.toString()}, t2=${t2.toString()})`;

        if (tx.tt >= startTime.tt)
            return Astronomy.Elongation(body, tx);

        // This event is in the past (earlier than startDate).
        // We need to search forward from t2 to find the next possible window.
        // We never need to search more than twice.
        startTime = t2.AddDays(1);
    }

    throw `SearchMaxElongation: failed to find event after 2 tries.`;
}

/**
 * Searches for the date and time Venus will next appear brightest as seen from the Earth.
 *
 * @param {string} body
 *      Currently only `"Venus"` is supported.
 *      Mercury's peak magnitude occurs at superior conjunction, when it is virtually impossible to see from Earth,
 *      so peak magnitude events have little practical value for that planet.
 *      The Moon reaches peak magnitude very close to full moon, which can be found using
 *      {@link Astronomy.SearchMoonQuarter} or {@link Astronomy.SearchMoonPhase}.
 *      The other planets reach peak magnitude very close to opposition,
 *      which can be found using {@link Astronomy.SearchRelativeLongitude}.
 *
 * @param {(Date | number | Astronomy.AstroTime)} startDate
 *      The date and time after which to find the next peak magnitude event.
 *
 * @returns {Astronomy.IlluminationInfo}
 */
Astronomy.SearchPeakMagnitude = function(body, startDate) {
    if (body !== 'Venus')
        throw 'SearchPeakMagnitude currently works for Venus only.';

    const dt = 0.01;

    function slope(t) {
        // The Search() function finds a transition from negative to positive values.
        // The derivative of magnitude y with respect to time t (dy/dt)
        // is negative as an object gets brighter, because the magnitude numbers
        // get smaller. At peak magnitude dy/dt = 0, then as the object gets dimmer,
        // dy/dt > 0.
        const t1 = t.AddDays(-dt/2);
        const t2 = t.AddDays(+dt/2);
        const y1 = Astronomy.Illumination(body, t1).mag;
        const y2 = Astronomy.Illumination(body, t2).mag;
        const m = (y2-y1) / dt;
        return m;
    }

    let startTime = Astronomy.MakeTime(startDate);

    // s1 and s2 are relative longitudes within which peak magnitude of Venus can occur.
    const s1 = 10.0;
    const s2 = 30.0;

    let iter = 0;
    while (++iter <= 2) {
        // Find current heliocentric relative longitude between the
        // inferior planet and the Earth.
        let plon = Astronomy.EclipticLongitude(body, startTime);
        let elon = Astronomy.EclipticLongitude('Earth', startTime);
        let rlon = LongitudeOffset(plon - elon);    // clamp to (-180, +180]

        // The slope function is not well-behaved when rlon is near 0 degrees or 180 degrees
        // because there is a cusp there that causes a discontinuity in the derivative.
        // So we need to guard against searching near such times.

        let t1, t2;
        let rlon_lo, rlon_hi, adjust_days;
        if (rlon >= -s1 && rlon < +s1) {
            // Seek to the window [+s1, +s2].
            adjust_days = 0;
            // Search forward for the time t1 when rel lon = +s1.
            rlon_lo = +s1;
            // Search forward for the time t2 when rel lon = +s2.
            rlon_hi = +s2;
        } else if (rlon >= +s2 || rlon < -s2 ) {
            // Seek to the next search window at [-s2, -s1].
            adjust_days = 0;
            // Search forward for the time t1 when rel lon = -s2.
            rlon_lo = -s2;
            // Search forward for the time t2 when rel lon = -s1.
            rlon_hi = -s1;
        } else if (rlon >= 0) {
            // rlon must be in the middle of the window [+s1, +s2].
            // Search BACKWARD for the time t1 when rel lon = +s1.
            adjust_days = -SynodicPeriod(body) / 4;
            rlon_lo = +s1;
            // Search forward from t1 to find t2 such that rel lon = +s2.
            rlon_hi = +s2;
        } else {
            // rlon must be in the middle of the window [-s2, -s1].
            // Search BACKWARD for the time t1 when rel lon = -s2.
            adjust_days = -SynodicPeriod(body) / 4;
            rlon_lo = -s2;
            // Search forward from t1 to find t2 such that rel lon = -s1.
            rlon_hi = -s1;
        }

        let t_start = startTime.AddDays(adjust_days);
        t1 = Astronomy.SearchRelativeLongitude(body, rlon_lo, t_start);
        t2 = Astronomy.SearchRelativeLongitude(body, rlon_hi, t1);

        // Now we have a time range [t1,t2] that brackets a maximum magnitude event.
        // Confirm the bracketing.
        let m1 = slope(t1);
        if (m1 >= 0)
            throw `SearchPeakMagnitude: internal error: m1 = ${m1}`;

        let m2 = slope(t2);
        if (m2 <= 0)
            throw `SearchPeakMagnitude: internal error: m2 = ${m2}`;

        // Use the generic search algorithm to home in on where the slope crosses from negative to positive.
        let tx = Astronomy.Search(slope, t1, t2, {init_f1:m1, init_f2:m2, dt_tolerance_seconds:10});
        if (!tx)
            throw `SearchPeakMagnitude: failed search iter ${iter} (t1=${t1.toString()}, t2=${t2.toString()})`;

        if (tx.tt >= startTime.tt)
            return Astronomy.Illumination(body, tx);

        // This event is in the past (earlier than startDate).
        // We need to search forward from t2 to find the next possible window.
        // We never need to search more than twice.
        startTime = t2.AddDays(1);
    }

    throw `SearchPeakMagnitude: failed to find event after 2 tries.`;
}

/**
 * Represents a closest or farthest point in a body's orbit around its primary.
 * For a planet orbiting the Sun, this is a perihelion or aphelion, respectively.
 * For the Moon orbiting the Earth, this is a perigee or apogee, respectively.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {Astronomy.AstroTime} time
 *      The date and time of the apsis.
 *
 * @property {number} kind
 *      For a closest approach (perigee or perihelion), `kind` is 0.
 *      For a farthest distance event (apogee or aphelion), `kind` is 1.
 *
 * @property {number} dist_au
 *      The distance between the centers of the two bodies in astronomical units (AU).
 *
 * @property {number} dist_km
 *      The distance between the centers of the two bodies in kilometers.
 *
 * @see {@link Astronomy.SearchLunarApsis}
 * @see {@link Astronomy.NextLunarApsis}
 */
class Apsis {
    constructor(time, kind, dist_au) {
        this.time = time;
        this.kind = kind;
        this.dist_au = dist_au;
        this.dist_km = dist_au * KM_PER_AU;
    }
}

/**
 * Finds the next perigee (closest approach) or apogee (farthest remove) of the Moon
 * that occurs after the specified date and time.
 *
 * @param {(Date | number | Astronomy.AstroTime)} startDate
 *      The date and time after which to find the next perigee or apogee.
 *
 * @returns {Astronomy.Apsis}
 */
Astronomy.SearchLunarApsis = function(startDate) {
    const dt = 0.001;

    function distance_slope(t) {
        let t1 = t.AddDays(-dt/2);
        let t2 = t.AddDays(+dt/2);

        let r1 = CalcMoon(t1).distance_au;
        let r2 = CalcMoon(t2).distance_au;

        let m = (r2-r1) / dt;
        return m;
    }

    function negative_distance_slope(t) {
        return -distance_slope(t);
    }

    // Check the rate of change of the distance dr/dt at the start time.
    // If it is positive, the Moon is currently getting farther away,
    // so start looking for apogee.
    // Conversely, if dr/dt < 0, start looking for perigee.
    // Either way, the polarity of the slope will change, so the product will be negative.
    // Handle the crazy corner case of exactly touching zero by checking for m1*m2 <= 0.

    let t1 = Astronomy.MakeTime(startDate);
    let m1 = distance_slope(t1);
    const increment = 5;      // number of days to skip in each iteration

    for (var iter = 0; iter * increment < 2 * MEAN_SYNODIC_MONTH; ++iter) {
        let t2 = t1.AddDays(increment);
        let m2 = distance_slope(t2);

        if (m1 * m2 <= 0) {
            // The time range [t1, t2] contains an apsis.
            // Figure out whether it is perigee or apogee.

            if (m1 < 0 || m2 > 0) {
                // We found a minimum distance event: perigee.
                // Search the time range [t1, t2] for the time when the slope goes
                // from negative to positive.
                let tx = Astronomy.Search(distance_slope, t1, t2, {init_f1:m1, init_f2:m2});
                if (tx == null)
                    throw 'SearchLunarApsis INTERNAL ERROR: perigee search failed!';

                let dist = CalcMoon(tx).distance_au;
                return new Apsis(tx, 0, dist);
            }

            if (m1 > 0 || m2 < 0) {
                // We found a maximum distance event: apogee.
                // Search the time range [t1, t2] for the time when the slope goes
                // from positive to negative.
                let tx = Astronomy.Search(negative_distance_slope, t1, t2, {init_f1:-m1, init_f2:-m2});
                if (tx == null)
                    throw 'SearchLunarApsis INTERNAL ERROR: apogee search failed!';

                let dist = CalcMoon(tx).distance_au;
                return new Apsis(tx, 1, dist);
            }

            // This should never happen; it should not be possible for consecutive
            // times t1 and t2 to both have zero slope.
            throw 'SearchLunarApsis INTERNAL ERROR: cannot classify apsis event!';
        }

        t1 = t2;
        m1 = m2;
    }

    // It should not be possible to fail to find an apsis within 2 synodic months.
    throw 'SearchLunarApsis INTERNAL ERROR: could not find apsis within 2 synodic months of start date.';
}

/**
 * Given a lunar apsis returned by an initial call to {@link Astronomy.SearchLunarApsis},
 * or a previous call to `NextLunarApsis`, finds the next lunar apsis.
 * If the given apsis is a perigee, this function finds the next apogee, and vice versa.
 *
 * @param {Astronomy.Apsis} apsis
 *      A lunar perigee or apogee event.
 *
 * @returns {Astronomy.Apsis}
 *      The successor apogee for the given perigee, or the successor perigee for the given apogee.
 */
Astronomy.NextLunarApsis = function(apsis) {
    const skip = 11;    // number of days to skip to start looking for next apsis event
    let next = Astronomy.SearchLunarApsis(apsis.time.AddDays(skip));
    if (next.kind + apsis.kind !== 1) {
        throw `NextLunarApsis INTERNAL ERROR: did not find alternating apogee/perigee: prev=${apsis.kind} @ ${apsis.time.toString()}, next=${next.kind} @ ${next.time.toString()}`;
    }
    return next;
}

function PlanetExtreme(body, kind, start_time, dayspan) {
    const direction = (kind === 1) ? +1.0 : -1.0;
    const npoints = 10;

    for(;;) {
        const interval = dayspan / (npoints - 1);

        if (interval < 1.0 / 1440.0)    /* iterate until uncertainty is less than one minute */
        {
            const apsis_time = start_time.AddDays(interval / 2.0);
            const dist_au = Astronomy.HelioDistance(body, apsis_time);
            return new Apsis(apsis_time, kind, dist_au);
        }

        let best_i = -1;
        let best_dist = 0.0;
        for (let i=0; i < npoints; ++i) {
            const time = start_time.AddDays(i * interval);
            const dist = direction * Astronomy.HelioDistance(body, time);
            if (i==0 || dist > best_dist) {
                best_i = i;
                best_dist = dist;
            }
        }

        /* Narrow in on the extreme point. */
        start_time = start_time.AddDays((best_i - 1) * interval);
        dayspan = 2.0 * interval;
    }
}

function BruteSearchPlanetApsis(body, startTime) {
    /*
        Neptune is a special case for two reasons:
        1. Its orbit is nearly circular (low orbital eccentricity).
        2. It is so distant from the Sun that the orbital period is very long.
        Put together, this causes wobbling of the Sun around the Solar System Barycenter (SSB)
        to be so significant that there are 3 local minima in the distance-vs-time curve
        near each apsis. Therefore, unlike for other planets, we can't use an optimized
        algorithm for finding dr/dt = 0.
        Instead, we use a dumb, brute-force algorithm of sampling and finding min/max
        heliocentric distance.

        There is a similar problem in the TOP2013 model for Pluto:
        Its position vector has high-frequency oscillations that confuse the
        slope-based determination of apsides.
    */

    /*
        Rewind approximately 30 degrees in the orbit,
        then search forward for 270 degrees.
        This is a very cautious way to prevent missing an apsis.
        Typically we will find two apsides, and we pick whichever
        apsis is ealier, but after startTime.
        Sample points around this orbital arc and find when the distance
        is greatest and smallest.
    */
    const npoints = 100;
    const t1 = startTime.AddDays(Planet[body].OrbitalPeriod * ( -30 / 360));
    const t2 = startTime.AddDays(Planet[body].OrbitalPeriod * (+270 / 360));
    let t_min = t1;
    let t_max = t1;
    let min_dist = -1.0;
    let max_dist = -1.0;
    const interval = (t2.ut - t1.ut) / (npoints - 1);

    for (let i=0; i < npoints; ++i) {
        const time = t1.AddDays(i * interval);
        const dist = Astronomy.HelioDistance(body, time);
        if (i === 0) {
            max_dist = min_dist = dist;
        } else {
            if (dist > max_dist) {
                max_dist = dist;
                t_max = time;
            }
            if (dist < min_dist) {
                min_dist = dist;
                t_min = time;
            }
        }
    }

    const perihelion = PlanetExtreme(body, 0, t_min.AddDays(-2*interval), 4*interval);
    const aphelion   = PlanetExtreme(body, 1, t_max.AddDays(-2*interval), 4*interval);
    if (perihelion.time.tt >= startTime.tt) {
        if (aphelion.time.tt >= startTime.tt && aphelion.time.tt < perihelion.time.tt) {
            return aphelion;
        }
        return perihelion;
    }
    if (aphelion.time.tt >= startTime.tt) {
        return aphelion;
    }
    throw 'Internal error: failed to find Neptune apsis.';
}

/**
 * Finds the date and time of a planet's perihelion (closest approach to the Sun)
 * or aphelion (farthest distance from the Sun) after a given time.
 *
 * Given a date and time to start the search in `startTime`, this function finds the
 * next date and time that the center of the specified planet reaches the closest or farthest point
 * in its orbit with respect to the center of the Sun, whichever comes first
 * after `startTime`.
 *
 * The closest point is called *perihelion* and the farthest point is called *aphelion*.
 * The word *apsis* refers to either event.
 *
 * To iterate through consecutive alternating perihelion and aphelion events,
 * call `SearchPlanetApsis` once, then use the return value to call
 * {@link Astronomy.NextPlanetApsis}. After that, keep feeding the previous return value
 * from `NextPlanetApsis` into another call of `NextPlanetApsis`
 * as many times as desired.
 *
 * @param {string} body
 *      The planet for which to find the next perihelion/aphelion event.
 *      Not allowed to be `"Sun"` or `"Moon"`.
 *
 * @param {Astronomy.AstroTime} startTime
 *      The date and time at which to start searching for the next perihelion or aphelion.
 *
 * @returns {Astronomy.Apsis}
 *      The next perihelion or aphelion that occurs after `startTime`.
 */
Astronomy.SearchPlanetApsis = function(body, startTime) {
    if (body === 'Neptune' || body === 'Pluto') {
        return BruteSearchPlanetApsis(body, startTime);
    }

    function positive_slope(t) {
        const dt = 0.001;
        let t1 = t.AddDays(-dt/2);
        let t2 = t.AddDays(+dt/2);
        let r1 = Astronomy.HelioDistance(body, t1);
        let r2 = Astronomy.HelioDistance(body, t2);
        let m = (r2-r1) / dt;
        return m;
    }

    function negative_slope(t) {
        return -positive_slope(t);
    }

    const orbit_period_days = Planet[body].OrbitalPeriod;
    const increment = orbit_period_days / 6.0;
    let t1 = startTime;
    let m1 = positive_slope(t1);
    for (let iter = 0; iter * increment < 2.0 * orbit_period_days; ++iter)
    {
        const t2 = t1.AddDays(increment);
        const m2 = positive_slope(t2);
        if (m1 * m2 <= 0.0)
        {
            /* There is a change of slope polarity within the time range [t1, t2]. */
            /* Therefore this time range contains an apsis. */
            /* Figure out whether it is perihelion or aphelion. */

            let slope_func, kind;
            if (m1 < 0.0 || m2 > 0.0)
            {
                /* We found a minimum-distance event: perihelion. */
                /* Search the time range for the time when the slope goes from negative to positive. */
                slope_func = positive_slope;
                kind = 0;    // perihelion
            }
            else if (m1 > 0.0 || m2 < 0.0)
            {
                /* We found a maximum-distance event: aphelion. */
                /* Search the time range for the time when the slope goes from positive to negative. */
                slope_func = negative_slope;
                kind = 1;   // aphelion
            }
            else
            {
                /* This should never happen. It should not be possible for both slopes to be zero. */
                throw "Internal error with slopes in SearchPlanetApsis";
            }

            const search = Astronomy.Search(slope_func, t1, t2, 1.0);
            if (search == null)
                throw "Failed to find slope transition in planetary apsis search.";

            const dist = Astronomy.HelioDistance(body, search);
            return new Apsis(search, kind, dist);
        }
        /* We have not yet found a slope polarity change. Keep searching. */
        t1 = t2;
        m1 = m2;
    }
    throw "Internal error: should have found planetary apsis within 2 orbital periods.";
}

/**
 * Finds the next planetary perihelion or aphelion event in a series.
 *
 * This function requires an {@link Astronomy.Apsis} value obtained from a call
 * to {@link Astronomy.SearchPlanetApsis} or `NextPlanetApsis`.
 * Given an aphelion event, this function finds the next perihelion event, and vice versa.
 * See {@link Astronomy.SearchPlanetApsis} for more details.
 *
 * @param {string} body
 *      The planet for which to find the next perihelion/aphelion event.
 *      Not allowed to be `"Sun"` or `"Moon"`.
 *      Must match the body passed into the call that produced the `apsis` parameter.
 *
 * @param {Astronomy.Apsis} apsis
 *      An apsis event obtained from a call to {@link Astronomy.SearchPlanetApsis} or `NextPlanetApsis`.
 *
 * @returns {Astronomy.Apsis}
 *      Same as the return value for {@link Astronomy.SearchPlanetApsis}.
 */
Astronomy.NextPlanetApsis = function(body, apsis) {
    if (apsis.kind !== 0 && apsis.kind !== 1) {
        throw `Invalid apsis kind: ${apsis.kind}`;
    }

    /* skip 1/4 of an orbit before starting search again */
    const skip = 0.25 * Planet[body].OrbitalPeriod;
    const time = apsis.time.AddDays(skip);
    const next = Astronomy.SearchPlanetApsis(body, time);

    /* Verify that we found the opposite apsis from the previous one. */
    if (next.kind + apsis.kind !== 1) {
        throw `Internal error: previous apsis was ${apsis.kind}, but found ${next.kind} for next apsis.`;
    }

    return next;
}

/**
 * Calculates the inverse of a rotation matrix.
 * Given a rotation matrix that performs some coordinate transform,
 * this function returns the matrix that reverses that trasnform.
 *
 * @param {Astronomy.RotationMatrix} rotation
 *      The rotation matrix to be inverted.
 *
 * @returns {Astronomy.RotationMatrix}
 *      The inverse rotation matrix.
 */
Astronomy.InverseRotation = function(rotation) {
    return new RotationMatrix([
        [rotation.rot[0][0], rotation.rot[1][0], rotation.rot[2][0]],
        [rotation.rot[0][1], rotation.rot[1][1], rotation.rot[2][1]],
        [rotation.rot[0][2], rotation.rot[1][2], rotation.rot[2][2]]
    ]);
}

/**
 * Creates a rotation based on applying one rotation followed by another.
 * Given two rotation matrices, returns a combined rotation matrix that is
 * equivalent to rotating based on the first matrix, followed by the second.
 *
 * @param {Astronomy.RotationMatrix} a
 *      The first rotation to apply.
 *
 * @param {Astronomy.RotationMatrix} b
 *      The second rotation to apply.
 *
 * @returns {Astronomy.RotationMatrix}
 *      The combined rotation matrix.
 */
Astronomy.CombineRotation = function(a, b) {
    /*
        Use matrix multiplication: c = b*a.
        We put 'b' on the left and 'a' on the right because,
        just like when you use a matrix M to rotate a vector V,
        you put the M on the left in the product M*V.
        We can think of this as 'b' rotating all the 3 column vectors in 'a'.
    */

    return new RotationMatrix([
        [
            b.rot[0][0]*a.rot[0][0] + b.rot[1][0]*a.rot[0][1] + b.rot[2][0]*a.rot[0][2],
            b.rot[0][1]*a.rot[0][0] + b.rot[1][1]*a.rot[0][1] + b.rot[2][1]*a.rot[0][2],
            b.rot[0][2]*a.rot[0][0] + b.rot[1][2]*a.rot[0][1] + b.rot[2][2]*a.rot[0][2]
        ],
        [
            b.rot[0][0]*a.rot[1][0] + b.rot[1][0]*a.rot[1][1] + b.rot[2][0]*a.rot[1][2],
            b.rot[0][1]*a.rot[1][0] + b.rot[1][1]*a.rot[1][1] + b.rot[2][1]*a.rot[1][2],
            b.rot[0][2]*a.rot[1][0] + b.rot[1][2]*a.rot[1][1] + b.rot[2][2]*a.rot[1][2]
        ],
        [
            b.rot[0][0]*a.rot[2][0] + b.rot[1][0]*a.rot[2][1] + b.rot[2][0]*a.rot[2][2],
            b.rot[0][1]*a.rot[2][0] + b.rot[1][1]*a.rot[2][1] + b.rot[2][1]*a.rot[2][2],
            b.rot[0][2]*a.rot[2][0] + b.rot[1][2]*a.rot[2][1] + b.rot[2][2]*a.rot[2][2]
        ]
    ]);
}

/**
 * Converts spherical coordinates to Cartesian coordinates.
 * Given spherical coordinates and a time at which they are valid,
 * returns a vector of Cartesian coordinates. The returned value
 * includes the time, as required by `AstroTime`.
 *
 * @param {Astronomy.Spherical} sphere
 *      Spherical coordinates to be converted.
 *
 * @param {Astronomy.AstroTime} time
 *      The time that should be included in the returned vector.
 *
 * @returns {Astronomy.Vector}
 *      The vector form of the supplied spherical coordinates.
 */
Astronomy.VectorFromSphere = function(sphere, time) {
    const radlat = sphere.lat * DEG2RAD;
    const radlon = sphere.lon * DEG2RAD;
    const rcoslat = sphere.dist * Math.cos(radlat);
    return new Vector(
        rcoslat * Math.cos(radlon),
        rcoslat * Math.sin(radlon),
        sphere.dist * Math.sin(radlat),
        time
    );
}

/**
 * Given angular equatorial coordinates in `equ`, calculates equatorial vector.
 *
 * @param {Astronomy.EquatorialCoordinates} equ
 *      An object that contains angular equatorial coordinates to be converted to a vector.
 *
 * @param {Astronomy.AstroTime} time
 *      The date and time of the observation. This is needed because the returned
 *      vector object requires a valid time value when passed to certain other functions.
 *
 * @returns {Astronomy.Vector}
 *      A vector in the equatorial system.
 */
Astronomy.VectorFromEquator = function(equ, time) {
    return Astronomy.VectorFromSphere(new Spherical(equ.dec, 15 * equ.ra, equ.dist), time);
}

/**
 * Given an equatorial vector, calculates equatorial angular coordinates.
 *
 * @param {Astronomy.Vector} vec
 *      A vector in an equatorial coordinate system.
 *
 * @returns {Astronomy.EquatorialCoordinates}
 *      Angular coordinates expressed in the same equatorial system as `vec`.
 */
Astronomy.EquatorFromVector = function(vec) {
    const sphere = Astronomy.SphereFromVector(vec);
    return new EquatorialCoordinates(sphere.lon / 15, sphere.lat, sphere.dist);
}

/**
 * Converts Cartesian coordinates to spherical coordinates.
 *
 * Given a Cartesian vector, returns latitude, longitude, and distance.
 *
 * @param {Astronomy.Vector} vector
 *      Cartesian vector to be converted to spherical coordinates.
 *
 * @returns {Astronomy.Spherical}
 *      Spherical coordinates that are equivalent to the given vector.
 */
Astronomy.SphereFromVector = function(vector) {
    const xyproj = vector.x*vector.x + vector.y*vector.y;
    const dist = Math.sqrt(xyproj + vector.z*vector.z);
    let lat, lon;
    if (xyproj === 0.0) {
        if (vector.z === 0.0) {
            throw 'Zero-length vector not allowed.';
        }
        lon = 0.0;
        lat = (vector.z < 0.0) ? -90.0 : +90.0;
    } else {
        lon = RAD2DEG * Math.atan2(vector.y, vector.x);
        if (lon < 0.0) {
            lon += 360.0;
        }
        lat = RAD2DEG * Math.atan2(vector.z, Math.sqrt(xyproj));
    }
    return new Spherical(lat, lon, dist);
}

function ToggleAzimuthDirection(az) {
    az = 360.0 - az;
    if (az >= 360.0)
        az -= 360.0;
    else if (az < 0.0)
        az += 360.0;
    return az;
}

/**
 * Converts Cartesian coordinates to horizontal coordinates.
 *
 * Given a horizontal Cartesian vector, returns horizontal azimuth and altitude.
 *
 * *IMPORTANT:* This function differs from {@link Astronomy.SphereFromVector} in two ways:
 * - `SphereFromVector` returns a `lon` value that represents azimuth defined counterclockwise
 *   from north (e.g., west = +90), but this function represents a clockwise rotation
 *   (e.g., east = +90). The difference is because `SphereFromVector` is intended
 *   to preserve the vector "right-hand rule", while this function defines azimuth in a more
 *   traditional way as used in navigation and cartography.
 * - This function optionally corrects for atmospheric refraction, while `SphereFromVector` does not.
 *
 * The returned object contains the azimuth in `lon`.
 * It is measured in degrees clockwise from north: east = +90 degrees, west = +270 degrees.
 *
 * The altitude is stored in `lat`.
 *
 * The distance to the observed object is stored in `dist`,
 * and is expressed in astronomical units (AU).
 *
 * @param {Astronomy.Vector} vector
 *      Cartesian vector to be converted to horizontal coordinates.
 *
 * @param {string} refraction
 *      `"normal"`: correct altitude for atmospheric refraction (recommended).
 *      `"jplhor"`: for JPL Horizons compatibility testing only; not recommended for normal use.
 *      `null`: no atmospheric refraction correction is performed.
 *
 * @returns {Astronomy.Spherical}
 */
Astronomy.HorizonFromVector = function(vector, refraction) {
    const sphere = Astronomy.SphereFromVector(vector);
    sphere.lon = ToggleAzimuthDirection(sphere.lon);
    sphere.lat += Astronomy.Refraction(refraction, sphere.lat);
    return sphere;
}


/**
 * Given apparent angular horizontal coordinates in `sphere`, calculate horizontal vector.
 *
 * @param {Astronomy.Spherical} sphere
 *      A structure that contains apparent horizontal coordinates:
 *      `lat` holds the refracted azimuth angle,
 *      `lon` holds the azimuth in degrees clockwise from north,
 *      and `dist` holds the distance from the observer to the object in AU.
 *
 * @param {Astronomy.AstroTime} time
 *      The date and time of the observation. This is needed because the returned
 *      vector object requires a valid time value when passed to certain other functions.
 *
 * @param {string} refraction
 *      `"normal"`: correct altitude for atmospheric refraction (recommended).
 *      `"jplhor"`: for JPL Horizons compatibility testing only; not recommended for normal use.
 *      `null`: no atmospheric refraction correction is performed.
 *
 * @returns {Astronomy.Vector}
 *      A vector in the horizontal system: `x` = north, `y` = west, and `z` = zenith (up).
 */
Astronomy.VectorFromHorizon = function(sphere, time, refraction) {
    /* Convert azimuth from clockwise-from-north to counterclockwise-from-north. */
    const lon = ToggleAzimuthDirection(sphere.lon);

    /* Reverse any applied refraction. */
    const lat = sphere.lat + Astronomy.InverseRefraction(refraction, sphere.lat);

    const xsphere = new Spherical(lat, lon, sphere.dist);
    return Astronomy.VectorFromSphere(xsphere, time);
}


/**
 * Calculates the amount of "lift" to an altitude angle caused by atmospheric refraction.
 *
 * Given an altitude angle and a refraction option, calculates
 * the amount of "lift" caused by atmospheric refraction.
 * This is the number of degrees higher in the sky an object appears
 * due to the lensing of the Earth's atmosphere.
 *
 * @param {string} refraction
 *      `"normal"`: correct altitude for atmospheric refraction (recommended).
 *      `"jplhor"`: for JPL Horizons compatibility testing only; not recommended for normal use.
 *      `null`: no atmospheric refraction correction is performed.
 *
 * @param {number} altitude
 *      An altitude angle in a horizontal coordinate system. Must be a value between -90 and +90.
 *
 * @returns {number}
 *      The angular adjustment in degrees to be added to the altitude angle to correct for atmospheric lensing.
 */
Astronomy.Refraction = function(refraction, altitude) {
    let refr;

    VerifyNumber(altitude);

    if (altitude < -90.0 || altitude > +90.0)
        return 0.0;     /* no attempt to correct an invalid altitude */

    if (refraction === 'normal' || refraction === 'jplhor') {
        // http://extras.springer.com/1999/978-1-4471-0555-8/chap4/horizons/horizons.pdf
        // JPL Horizons says it uses refraction algorithm from
        // Meeus "Astronomical Algorithms", 1991, p. 101-102.
        // I found the following Go implementation:
        // https://github.com/soniakeys/meeus/blob/master/v3/refraction/refract.go
        // This is a translation from the function "Saemundsson" there.
        // I found experimentally that JPL Horizons clamps the angle to 1 degree below the horizon.
        // This is important because the 'refr' formula below goes crazy near hd = -5.11.
        let hd = altitude;
        if (hd < -1.0)
            hd = -1.0;

        refr = (1.02 / Math.tan((hd+10.3/(hd+5.11))*DEG2RAD)) / 60.0;

        if (refraction === 'normal' && altitude < -1.0) {
            // In "normal" mode we gradually reduce refraction toward the nadir
            // so that we never get an altitude angle less than -90 degrees.
            // When horizon angle is -1 degrees, the factor is exactly 1.
            // As altitude approaches -90 (the nadir), the fraction approaches 0 linearly.
            refr *= (altitude + 90.0) / 89.0;
        }
    } else {
        /* No refraction, or the refraction option is invalid. */
        refr = 0.0;
    }

    return refr;
}

/**
 * Calculates the inverse of an atmospheric refraction angle.
 *
 * Given an observed altitude angle that includes atmospheric refraction,
 * calculate the negative angular correction to obtain the unrefracted
 * altitude. This is useful for cases where observed horizontal
 * coordinates are to be converted to another orientation system,
 * but refraction first must be removed from the observed position.
 *
 * @param {string} refraction
 *      `"normal"`: correct altitude for atmospheric refraction (recommended).
 *      `"jplhor"`: for JPL Horizons compatibility testing only; not recommended for normal use.
 *      `null`: no atmospheric refraction correction is performed.
 *
 * @param {number} bent_altitude
 *      The apparent altitude that includes atmospheric refraction.
 *
 * @returns {number}
 *      The angular adjustment in degrees to be added to the
 *      altitude angle to correct for atmospheric lensing.
 *      This will be less than or equal to zero.
 */
Astronomy.InverseRefraction = function(refraction, bent_altitude) {
    if (bent_altitude < -90.0 || bent_altitude > +90.0) {
        return 0.0;     /* no attempt to correct an invalid altitude */
    }

    /* Find the pre-adjusted altitude whose refraction correction leads to 'altitude'. */
    let altitude = bent_altitude - Astronomy.Refraction(refraction, bent_altitude);

    for(;;) {
        /* See how close we got. */
        let diff = (altitude + Astronomy.Refraction(refraction, altitude)) - bent_altitude;
        if (Math.abs(diff) < 1.0e-14)
            return altitude - bent_altitude;

        altitude -= diff;
    }
}

/**
 * Applies a rotation to a vector, yielding a rotated vector.
 *
 * This function transforms a vector in one orientation to a vector
 * in another orientation.
 *
 * @param {Astronomy.RotationMatrix} rotation
 *      A rotation matrix that specifies how the orientation of the vector is to be changed.
 *
 * @param {Astronomy.Vector} vector
 *      The vector whose orientation is to be changed.
 *
 * @returns {Astronomy.Vector}
 *      A vector in the orientation specified by `rotation`.
 */
Astronomy.RotateVector = function(rotation, vector)
{
    return new Vector(
        rotation.rot[0][0]*vector.x + rotation.rot[1][0]*vector.y + rotation.rot[2][0]*vector.z,
        rotation.rot[0][1]*vector.x + rotation.rot[1][1]*vector.y + rotation.rot[2][1]*vector.z,
        rotation.rot[0][2]*vector.x + rotation.rot[1][2]*vector.y + rotation.rot[2][2]*vector.z,
        vector.t
    );
}


/**
 * Calculates a rotation matrix from equatorial J2000 (EQJ) to ecliptic J2000 (ECL).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: EQJ = equatorial system, using equator at J2000 epoch.
 * Target: ECL = ecliptic system, using equator at J2000 epoch.
 *
 * @returns {Astronomy.RotationMatrix}
 *      A rotation matrix that converts EQJ to ECL.
 */
Astronomy.Rotation_EQJ_ECL = function() {
    /* ob = mean obliquity of the J2000 ecliptic = 0.40909260059599012 radians. */
    const c = 0.9174821430670688;    /* cos(ob) */
    const s = 0.3977769691083922;    /* sin(ob) */
    return new RotationMatrix([
        [ 1,  0,  0],
        [ 0, +c, -s],
        [ 0, +s, +c]
    ]);
}


/**
 * Calculates a rotation matrix from ecliptic J2000 (ECL) to equatorial J2000 (EQJ).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: ECL = ecliptic system, using equator at J2000 epoch.
 * Target: EQJ = equatorial system, using equator at J2000 epoch.
 *
 * @returns {Astronomy.RotationMatrix}
 *      A rotation matrix that converts ECL to EQJ.
 */
Astronomy.Rotation_ECL_EQJ = function() {
    /* ob = mean obliquity of the J2000 ecliptic = 0.40909260059599012 radians. */
    const c = 0.9174821430670688;    /* cos(ob) */
    const s = 0.3977769691083922;    /* sin(ob) */
    return new RotationMatrix([
        [ 1,  0,  0],
        [ 0, +c, +s],
        [ 0, -s, +c]
    ]);
}


/**
 * Calculates a rotation matrix from equatorial J2000 (EQJ) to equatorial of-date (EQD).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: EQJ = equatorial system, using equator at J2000 epoch.
 * Target: EQD = equatorial system, using equator of the specified date/time.
 *
 * @param {Astronomy.AstroTime} time
 *      The date and time at which the Earth's equator defines the target orientation.
 *
 * @returns {Astronomy.RotationMatrix}
 *      A rotation matrix that converts EQJ to EQD at `time`.
 */
Astronomy.Rotation_EQJ_EQD = function(time) {
    const prec = precession_rot(0.0, time.tt);
    const nut = nutation_rot(time, 0);
    return Astronomy.CombineRotation(prec, nut);
}


/**
 * Calculates a rotation matrix from equatorial of-date (EQD) to equatorial J2000 (EQJ).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: EQD = equatorial system, using equator of the specified date/time.
 * Target: EQJ = equatorial system, using equator at J2000 epoch.
 *
 * @param {Astronomy.AstroTime} time
 *      The date and time at which the Earth's equator defines the source orientation.
 *
 * @returns {Astronomy.RotationMatrix}
 *      A rotation matrix that converts EQD at `time` to EQJ.
 */
Astronomy.Rotation_EQD_EQJ = function(time) {
    const nut = nutation_rot(time, 1);
    const prec = precession_rot(time.tt, 0.0);
    return Astronomy.CombineRotation(nut, prec);
}


/**
 * Calculates a rotation matrix from equatorial of-date (EQD) to horizontal (HOR).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: EQD = equatorial system, using equator of the specified date/time.
 * Target: HOR = horizontal system.
 *
 * Use `HorizonFromVector` to convert the return value
 * to a traditional altitude/azimuth pair.
 *
 * @param {Astronomy.AstroTime} time
 *      The date and time at which the Earth's equator applies.
 *
 * @param {Astronomy.Observer} observer
 *      A location near the Earth's mean sea level that defines the observer's horizon.
 *
 * @returns {Astronomy.RotationMatrix}
 *      A rotation matrix that converts EQD to HOR at `time` and for `observer`.
 *      The components of the horizontal vector are:
 *      x = north, y = west, z = zenith (straight up from the observer).
 *      These components are chosen so that the "right-hand rule" works for the vector
 *      and so that north represents the direction where azimuth = 0.
 */
Astronomy.Rotation_EQD_HOR = function(time, observer) {
    const sinlat = Math.sin(observer.latitude * DEG2RAD);
    const coslat = Math.cos(observer.latitude * DEG2RAD);
    const sinlon = Math.sin(observer.longitude * DEG2RAD);
    const coslon = Math.cos(observer.longitude * DEG2RAD);

    const uze = [coslat * coslon, coslat * sinlon, sinlat];
    const une = [-sinlat * coslon, -sinlat * sinlon, coslat];
    const uwe = [sinlon, -coslon, 0];

    const spin_angle = -15 * sidereal_time(time);
    const uz = spin(spin_angle, uze);
    const un = spin(spin_angle, une);
    const uw = spin(spin_angle, uwe);

    return new RotationMatrix([
        [un[0], uw[0], uz[0]],
        [un[1], uw[1], uz[1]],
        [un[2], uw[2], uz[2]],
    ]);
}


/**
 * Calculates a rotation matrix from horizontal (HOR) to equatorial of-date (EQD).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: HOR = horizontal system (x=North, y=West, z=Zenith).
 * Target: EQD = equatorial system, using equator of the specified date/time.
 *
 * @param {Astronomy.AstroTime} time
 *      The date and time at which the Earth's equator applies.
 *
 * @param {Astronomy.Observer} observer
 *      A location near the Earth's mean sea level that defines the observer's horizon.
 *
 * @returns {Astronomy.RotationMatrix}
 *      A rotation matrix that converts HOR to EQD at `time` and for `observer`.
 */
Astronomy.Rotation_HOR_EQD = function(time, observer) {
    const rot = Astronomy.Rotation_EQD_HOR(time, observer);
    return Astronomy.InverseRotation(rot);
}


/**
 * Calculates a rotation matrix from horizontal (HOR) to J2000 equatorial (EQJ).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: HOR = horizontal system (x=North, y=West, z=Zenith).
 * Target: EQJ = equatorial system, using equator at the J2000 epoch.
 *
 * @param {Astronomy.AstroTime} time
 *      The date and time of the observation.
 *
 * @param {Astronomy.Observer} observer
 *      A location near the Earth's mean sea level that defines the observer's horizon.
 *
 * @returns {Astronomy.RotationMatrix}
 *      A rotation matrix that converts HOR to EQD at `time` and for `observer`.
 */
Astronomy.Rotation_HOR_EQJ = function(time, observer) {
    const hor_eqd = Astronomy.Rotation_HOR_EQD(time, observer);
    const eqd_eqj = Astronomy.Rotation_EQD_EQJ(time);
    return Astronomy.CombineRotation(hor_eqd, eqd_eqj);
}


/**
 * Calculates a rotation matrix from equatorial J2000 (EQJ) to horizontal (HOR).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: EQJ = equatorial system, using the equator at the J2000 epoch.
 * Target: HOR = horizontal system.
 *
 * Use {@link Astronomy.HorizonFromVector} to convert the return value
 * to a traditional altitude/azimuth pair.
 *
 * @param time
 *      The date and time of the desired horizontal orientation.
 *
 * @param observer
 *      A location near the Earth's mean sea level that defines the observer's horizon.
 *
 * @return
 *      A rotation matrix that converts EQJ to HOR at `time` and for `observer`.
 *      The components of the horizontal vector are:
 *      x = north, y = west, z = zenith (straight up from the observer).
 *      These components are chosen so that the "right-hand rule" works for the vector
 *      and so that north represents the direction where azimuth = 0.
 */
Astronomy.Rotation_EQJ_HOR = function(time, observer) {
    const rot = Astronomy.Rotation_HOR_EQJ(time, observer);
    return Astronomy.InverseRotation(rot);
}


/**
 * Calculates a rotation matrix from equatorial of-date (EQD) to ecliptic J2000 (ECL).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: EQD = equatorial system, using equator of date.
 * Target: ECL = ecliptic system, using equator at J2000 epoch.
 *
 * @param {Astronomy.AstroTime} time
 *      The date and time of the source equator.
 *
 * @returns {Astronomy.RotationMatrix}
 *      A rotation matrix that converts EQD to ECL.
 */
Astronomy.Rotation_EQD_ECL = function(time) {
    const eqd_eqj = Astronomy.Rotation_EQD_EQJ(time);
    const eqj_ecl = Astronomy.Rotation_EQJ_ECL();
    return Astronomy.CombineRotation(eqd_eqj, eqj_ecl);
}


/**
 * Calculates a rotation matrix from ecliptic J2000 (ECL) to equatorial of-date (EQD).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: ECL = ecliptic system, using equator at J2000 epoch.
 * Target: EQD = equatorial system, using equator of date.
 *
 * @param {Astronomy.AstroTime} time
 *      The date and time of the desired equator.
 *
 * @returns {Astronomy.RotationMatrix}
 *      A rotation matrix that converts ECL to EQD.
 */
Astronomy.Rotation_ECL_EQD = function(time) {
    const rot = Astronomy.Rotation_EQD_ECL(time);
    return Astronomy.InverseRotation(rot);
}


/**
 * Calculates a rotation matrix from ecliptic J2000 (ECL) to horizontal (HOR).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: ECL = ecliptic system, using equator at J2000 epoch.
 * Target: HOR = horizontal system.
 *
 * Use {@link Astronomy.HorizonFromVector} to convert the return value
 * to a traditional altitude/azimuth pair.
 *
 * @param {Astronomy.AstroTime} time
 *      The date and time of the desired horizontal orientation.
 *
 * @param {Astronomy.Observer} observer
 *      A location near the Earth's mean sea level that defines the observer's horizon.
 *
 * @returns {Astronomy.RotationMatrix}
 *      A rotation matrix that converts ECL to HOR at `time` and for `observer`.
 *      The components of the horizontal vector are:
 *      x = north, y = west, z = zenith (straight up from the observer).
 *      These components are chosen so that the "right-hand rule" works for the vector
 *      and so that north represents the direction where azimuth = 0.
 */
Astronomy.Rotation_ECL_HOR = function(time, observer) {
    const ecl_eqd = Astronomy.Rotation_ECL_EQD(time);
    const eqd_hor = Astronomy.Rotation_EQD_HOR(time, observer);
    return Astronomy.CombineRotation(ecl_eqd, eqd_hor);
}


/**
 * Calculates a rotation matrix from horizontal (HOR) to ecliptic J2000 (ECL).
 *
 * This is one of the family of functions that returns a rotation matrix
 * for converting from one orientation to another.
 * Source: HOR = horizontal system.
 * Target: ECL = ecliptic system, using equator at J2000 epoch.
 *
 * @param {Astronomy.AstroTime} time
 *      The date and time of the horizontal observation.
 *
 * @param {Astronomy.Observer} observer
 *      The location of the horizontal observer.
 *
 * @returns {Astronomy.RotationMatrix}
 *      A rotation matrix that converts HOR to ECL.
 */
Astronomy.Rotation_HOR_ECL = function(time, observer) {
    const rot = Astronomy.Rotation_ECL_HOR(time, observer);
    return Astronomy.InverseRotation(rot);
}


$ASTRO_CONSTEL()

let ConstelRot;
let Epoch2000;

/**
 * Reports the constellation that a given celestial point lies within.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {string} symbol
 *      3-character mnemonic symbol for the constellation, e.g. "Ori".
 *
 * @property {string} name
 *      Full name of constellation, e.g. "Orion".
 *
 * @property {number} ra1875
 *      Right ascension expressed in B1875 coordinates.
 *
 * @property {number} dec1875
 *      Declination expressed in B1875 coordinates.
 */
class ConstellationInfo {
    constructor(symbol, name, ra1875, dec1875) {
        this.symbol = symbol;
        this.name = name;
        this.ra1875 = ra1875;
        this.dec1875 = dec1875;
    }
}


/**
 * Determines the constellation that contains the given point in the sky.
 *
 * Given J2000 equatorial (EQJ) coordinates of a point in the sky,
 * determines the constellation that contains that point.
 *
 * @param {number} ra
 *      The right ascension (RA) of a point in the sky, using the J2000 equatorial system.
 *
 * @param {number} dec
 *      The declination (DEC) of a point in the sky, using the J2000 equatorial system.
 *
 * @returns {Astronomy.ConstellationInfo}
 *      An object that contains the 3-letter abbreviation and full name
 *      of the constellation that contains the given (ra,dec), along with
 *      the converted B1875 (ra,dec) for that point.
 */
Astronomy.Constellation = function(ra, dec) {
    VerifyNumber(ra);
    VerifyNumber(dec);
    if (dec < -90 || dec > +90) {
        throw 'Invalid declination angle. Must be -90..+90.';
    }
    // Clamp right ascension to [0, 24) sidereal hours.
    ra %= 24.0;
    if (ra < 0.0) {
        ra += 24.0;
    }

    // Lazy-initialize rotation matrix.
    if (!ConstelRot) {
        // Need to calculate the B1875 epoch. Based on this:
        // https://en.wikipedia.org/wiki/Epoch_(astronomy)#Besselian_years
        // B = 1900 + (JD - 2415020.31352) / 365.242198781
        // I'm interested in using TT instead of JD, giving:
        // B = 1900 + ((TT+2451545) - 2415020.31352) / 365.242198781
        // B = 1900 + (TT + 36524.68648) / 365.242198781
        // TT = 365.242198781*(B - 1900) - 36524.68648 = -45655.741449525
        // But the AstroTime constructor wants UT, not TT.
        // Near that date, I get a historical correction of ut-tt = 3.2 seconds.
        // That gives UT = -45655.74141261017 for the B1875 epoch,
        // or 1874-12-31T18:12:21.950Z.
        ConstelRot = Astronomy.Rotation_EQJ_EQD(new AstroTime(-45655.74141261017));
        Epoch2000 = new AstroTime(0);
    }

    // Convert coordinates from J2000 to B1875.
    const equ2000 = new EquatorialCoordinates(ra, dec, 1.0);
    const vec2000 = Astronomy.VectorFromEquator(equ2000, Epoch2000);
    const vec1875 = Astronomy.RotateVector(ConstelRot, vec2000);
    const equ1875 = Astronomy.EquatorFromVector(vec1875);

    // Search for the constellation using the B1875 coordinates.
    const fd = 10 / (4 * 60);   // conversion factor from compact units to DEC degrees
    const fr = fd / 15;         // conversion factor from compact units to RA  sidereal hours
    for (let b of ConstelBounds) {
        // Convert compact angular units to RA in hours, DEC in degrees.
        const dec = b[3] * fd;
        const ra_lo = b[1] * fr;
        const ra_hi = b[2] * fr;
        if (dec <= equ1875.dec && ra_lo <= equ1875.ra && equ1875.ra < ra_hi) {
            const c = ConstelNames[b[0]];
            return new ConstellationInfo(c[0], c[1], equ1875.ra, equ1875.dec);
        }
    }

    // This should never happen!
    throw 'Unable to find constellation for given coordinates.';
}

/**
 * Returns information about a lunar eclipse.
 *
 * Returned by {@link Astronomy.SearchLunarEclipse} or {@link Astronomy.NextLunarEclipse}
 * to report information about a lunar eclipse event.
 * When a lunar eclipse is found, it is classified as penumbral, partial, or total.
 * Penumbral eclipses are difficult to observe, because the moon is only slightly dimmed
 * by the Earth's penumbra; no part of the Moon touches the Earth's umbra.
 * Partial eclipses occur when part, but not all, of the Moon touches the Earth's umbra.
 * Total eclipses occur when the entire Moon passes into the Earth's umbra.
 *
 * The `kind` field thus holds one of the strings `"penumbral"`, `"partial"`,
 * or `"total"`, depending on the kind of lunar eclipse found.
 *
 * Field `peak` holds the date and time of the peak of the eclipse, when it is at its peak.
 *
 * Fields `sd_penum`, `sd_partial`, and `sd_total` hold the semi-duration of each phase
 * of the eclipse, which is half of the amount of time the eclipse spends in each
 * phase (expressed in minutes), or 0 if the eclipse never reaches that phase.
 * By converting from minutes to days, and subtracting/adding with `peak`, the caller
 * may determine the date and time of the beginning/end of each eclipse phase.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {string} kind
 *      The type of lunar eclipse found.
 *
 * @property {Astronomy.AstroTime} peak
 *      The time of the eclipse at its peak.
 *
 * @property {number} sd_penum
 *      The semi-duration of the penumbral phase in minutes.
 *
 * @property {number} sd_partial
 *      The semi-duration of the penumbral phase in minutes, or 0.0 if none.
 *
 * @property {number} sd_total
 *      The semi-duration of the penumbral phase in minutes, or 0.0 if none.
 *
 */
class LunarEclipseInfo {
    constructor(kind, peak, sd_penum, sd_partial, sd_total) {
        this.kind = kind;
        this.peak = peak;
        this.sd_penum = sd_penum;
        this.sd_partial = sd_partial;
        this.sd_total = sd_total;
    }
}

class ShadowInfo {
    constructor(time, u, r, k, p, target, dir) {
        this.time = time;
        this.u = u;  // dot product of (heliocentric earth) and (geocentric moon): defines the shadow plane where the Moon is
        this.r = r;  // km distance between center of Moon and the line passing through the centers of the Sun and Earth.
        this.k = k;  // umbra radius in km, at the shadow plane
        this.p = p;  // penumbra radius in km, at the shadow plane
        this.target = target;
        this.dir = dir;
    }
}


function CalcShadow(body_radius_km, time, target, dir) {
    const u = (dir.x*target.x + dir.y*target.y + dir.z*target.z) / (dir.x*dir.x + dir.y*dir.y + dir.z*dir.z);
    const dx = (u * dir.x) - target.x;
    const dy = (u * dir.y) - target.y;
    const dz = (u * dir.z) - target.z;
    const r = KM_PER_AU * Math.sqrt(dx*dx + dy*dy + dz*dz);
    const k = +SUN_RADIUS_KM - (1.0 + u)*(SUN_RADIUS_KM - body_radius_km);
    const p = -SUN_RADIUS_KM + (1.0 + u)*(SUN_RADIUS_KM + body_radius_km);
    return new ShadowInfo(time, u, r, k, p, target, dir);
}


function EarthShadow(time) {
    const e = CalcVsop(vsop.Earth, time);
    const m = Astronomy.GeoMoon(time);
    return CalcShadow(EARTH_ECLIPSE_RADIUS_KM, time, m, e);
}


function MoonShadow(time) {
    // This is a variation on the logic in _EarthShadow().
    // Instead of a heliocentric Earth and a geocentric Moon,
    // we want a heliocentric Moon and a lunacentric Earth.
    const h = CalcVsop(vsop.Earth, time);    // heliocentric Earth
    const m = Astronomy.GeoMoon(time);       // geocentric Moon
    // Calculate lunacentric Earth.
    const e = new Vector(-m.x, -m.y, -m.z, m.t);
    // Convert geocentric moon to heliocentric Moon.
    m.x += h.x;
    m.y += h.y;
    m.z += h.z;
    return CalcShadow(MOON_MEAN_RADIUS_KM, time, e, m);
}


function LocalMoonShadow(time, observer) {
    // Calculate observer's geocentric position.
    // For efficiency, do this first, to populate the earth rotation parameters in 'time'.
    // That way they can be recycled instead of recalculated.
    const pos = geo_pos(time, observer);
    const h = CalcVsop(vsop.Earth, time);     // heliocentric Earth
    const m = Astronomy.GeoMoon(time);        // geocentric Moon

    // Calculate lunacentric location of an observer on the Earth's surface.
    const o = new Vector(pos[0] - m.x, pos[1] - m.y, pos[2] - m.z, time);

    // Convert geocentric moon to heliocentric Moon.
    m.x += h.x;
    m.y += h.y;
    m.z += h.z;

    return CalcShadow(MOON_MEAN_RADIUS_KM, time, o, m);
}


function PlanetShadow(body, planet_radius_km, time) {
    // Calculate light-travel-corrected vector from Earth to planet.
    const g = Astronomy.GeoVector(body, time, false);

    // Calculate light-travel-corrected vector from Earth to Sun.
    const e = Astronomy.GeoVector('Sun', time, false);

    // Deduce light-travel-corrected vector from Sun to planet.
    const p = new Vector(g.x - e.x, g.y - e.y, g.z - e.z, time);

    // Calcluate Earth's position from the planet's point of view.
    e.x = -g.x;
    e.y = -g.y;
    e.z = -g.z;

    return CalcShadow(planet_radius_km, time, e, p);
}


function ShadowDistanceSlope(shadowfunc, time) {
    const dt = 1.0 / 86400.0;
    const t1 = time.AddDays(-dt);
    const t2 = time.AddDays(+dt);
    const shadow1 = shadowfunc(t1);
    const shadow2 = shadowfunc(t2);
    return (shadow2.r - shadow1.r) / dt;
}


function PlanetShadowSlope(body, planet_radius_km, time) {
    const dt = 1.0 / 86400.0;
    const shadow1 = PlanetShadow(body, planet_radius_km, time.AddDays(-dt));
    const shadow2 = PlanetShadow(body, planet_radius_km, time.AddDays(+dt));
    return (shadow2.r - shadow1.r) / dt;
}


function PeakEarthShadow(search_center_time) {
    const window = 0.03;        /* initial search window, in days, before/after given time */
    const t1 = search_center_time.AddDays(-window);
    const t2 = search_center_time.AddDays(+window);
    const tx = Astronomy.Search(time => ShadowDistanceSlope(EarthShadow, time), t1, t2, 1.0);
    return EarthShadow(tx);
}


function PeakMoonShadow(search_center_time) {
    const window = 0.03;        /* initial search window, in days, before/after given time */
    const t1 = search_center_time.AddDays(-window);
    const t2 = search_center_time.AddDays(+window);
    const tx = Astronomy.Search(time => ShadowDistanceSlope(MoonShadow, time), t1, t2, 1.0);
    return MoonShadow(tx);
}


function PeakPlanetShadow(body, planet_radius_km, search_center_time) {
    // Search for when the body's shadow is closest to the center of the Earth.
    const window = 1.0;     // days before/after inferior conjunction to search for minimum shadow distance.
    const t1 = search_center_time.AddDays(-window);
    const t2 = search_center_time.AddDays(+window);
    const tx = Astronomy.Search(time => PlanetShadowSlope(body, planet_radius_km, time), t1, t2, 1.0);
    return PlanetShadow(body, planet_radius_km, tx);
}


function PeakLocalMoonShadow(search_center_time, observer) {
    // Search for the time near search_center_time that the Moon's shadow comes
    // closest to the given observer.
    const window = 0.2;
    const t1 = search_center_time.AddDays(-window);
    const t2 = search_center_time.AddDays(+window);
    function shadowfunc(time) {
        return LocalMoonShadow(time, observer);
    }
    const time = Astronomy.Search(time => ShadowDistanceSlope(shadowfunc, time), t1, t2, 1.0);
    if (!time) {
        throw `PeakLocalMoonShadow: search failure for search_center_time = ${search_center_time}`;
    }
    return LocalMoonShadow(time, observer);
}


function ShadowSemiDurationMinutes(center_time, radius_limit, window_minutes) {
    // Search backwards and forwards from the center time until shadow axis distance crosses radius limit.
    const window = window_minutes / (24.0 * 60.0);
    const before = center_time.AddDays(-window);
    const after  = center_time.AddDays(+window);
    const t1 = Astronomy.Search(time => -(EarthShadow(time).r - radius_limit), before, center_time, 1.0);
    const t2 = Astronomy.Search(time => +(EarthShadow(time).r - radius_limit), center_time, after, 1.0);
    if (t1 === null || t2 === null)
        throw 'Failed to find shadow semiduration';
    return (t2.ut - t1.ut) * ((24.0 * 60.0) / 2.0);    // convert days to minutes and average the semi-durations.
}


function MoonEclipticLatitudeDegrees(time) {
    const moon = CalcMoon(time);
    return RAD2DEG * moon.geo_eclip_lat;
}


/**
 * @brief Searches for a lunar eclipse.
 *
 * This function finds the first lunar eclipse that occurs after `startTime`.
 * A lunar eclipse may be penumbral, partial, or total.
 * See {@link Astronomy.LunarEclipseInfo} for more information.
 * To find a series of lunar eclipses, call this function once,
 * then keep calling {@link Astronomy.NextLunarEclipse} as many times as desired,
 * passing in the `center` value returned from the previous call.
 *
 * @param {(Date|number|Astronomy.AstroTime)} date
 *      The date and time for starting the search for a lunar eclipse.
 *
 * @returns {Astronomy.LunarEclipseInfo}
 */
Astronomy.SearchLunarEclipse = function(date) {
    const PruneLatitude = 1.8;   /* full Moon's ecliptic latitude above which eclipse is impossible */
    let fmtime = Astronomy.MakeTime(date);
    for (let fmcount = 0; fmcount < 12; ++fmcount) {
        /* Search for the next full moon. Any eclipse will be near it. */
        const fullmoon = Astronomy.SearchMoonPhase(180, fmtime, 40);
        if (fullmoon === null)
            throw 'Cannot find full moon.';

        /*
            Pruning: if the full Moon's ecliptic latitude is too large,
            a lunar eclipse is not possible. Avoid needless work searching for
            the minimum moon distance.
        */
       const eclip_lat = MoonEclipticLatitudeDegrees(fullmoon);
       if (Math.abs(eclip_lat) < PruneLatitude) {
           /* Search near the full moon for the time when the center of the Moon */
           /* is closest to the line passing through the centers of the Sun and Earth. */
           const shadow = PeakEarthShadow(fullmoon);
           if (shadow.r < shadow.p + MOON_MEAN_RADIUS_KM) {
               /* This is at least a penumbral eclipse. We will return a result. */
               let kind = 'penumbral';
               let sd_total = 0.0;
               let sd_partial = 0.0;
               let sd_penum = ShadowSemiDurationMinutes(shadow.time, shadow.p + MOON_MEAN_RADIUS_KM, 200.0);

               if (shadow.r < shadow.k + MOON_MEAN_RADIUS_KM) {
                   /* This is at least a partial eclipse. */
                   kind = 'partial';
                   sd_partial = ShadowSemiDurationMinutes(shadow.time, shadow.k + MOON_MEAN_RADIUS_KM, sd_penum);

                   if (shadow.r + MOON_MEAN_RADIUS_KM < shadow.k) {
                       /* This is a total eclipse. */
                       kind = 'total';
                       sd_total = ShadowSemiDurationMinutes(shadow.time, shadow.k - MOON_MEAN_RADIUS_KM, sd_partial);
                   }
               }
               return new LunarEclipseInfo(kind, shadow.time, sd_penum, sd_partial, sd_total);
           }
       }

       /* We didn't find an eclipse on this full moon, so search for the next one. */
       fmtime = fullmoon.AddDays(10);
    }

    /* This should never happen because there are always at least 2 full moons per year. */
    throw 'Failed to find lunar eclipse within 12 full moons.';
}


/**
    Reports the time and geographic location of the peak of a solar eclipse.

    Returned by {@link Astronomy.SearchGlobalSolarEclipse} or {@link Astronomy.NextGlobalSolarEclipse}
    to report information about a solar eclipse event.

    Field `peak` holds the date and time of the peak of the eclipse, defined as
    the instant when the axis of the Moon's shadow cone passes closest to the Earth's center.

    The eclipse is classified as partial, annular, or total, depending on the
    maximum amount of the Sun's disc obscured, as seen at the peak location
    on the surface of the Earth.

    The `kind` field thus holds one of the strings `"partial"`, `"annular"`, or `"total"`.
    A total eclipse is when the peak observer sees the Sun completely blocked by the Moon.
    An annular eclipse is like a total eclipse, but the Moon is too far from the Earth's surface
    to completely block the Sun; instead, the Sun takes on a ring-shaped appearance.
    A partial eclipse is when the Moon blocks part of the Sun's disc, but nobody on the Earth
    observes either a total or annular eclipse.

    If `kind` is `"total"` or `"annular"`, the `latitude` and `longitude`
    fields give the geographic coordinates of the center of the Moon's shadow projected
    onto the daytime side of the Earth at the instant of the eclipse's peak.
    If `kind` has any other value, `latitude` and `longitude` are undefined and should
    not be used.

    @class
    @memberof Astronomy

    @property {string} kind
        One of the following string values: `"partial"`, `"annular"`, `"total"`.

    @property {Astronomy.AstroTime} peak
        The date and time of the peak of the eclipse, defined as the instant
        when the axis of the Moon's shadow cone passes closest to the Earth's center.

    @property {number} distance
        The distance in kilometers between the axis of the Moon's shadow cone
        and the center of the Earth at the time indicated by `peak`.

    @property {(undefined|number)} latitude
        If `kind` holds `"total"`, the geographic latitude in degrees
        where the center of the Moon's shadow falls on the Earth at the
        time indicated by `peak`; otherwise, `latitude` holds `undefined`.

    @property {(undefined|number)} longitude
        If `kind` holds `"total"`, the geographic longitude in degrees
        where the center of the Moon's shadow falls on the Earth at the
        time indicated by `peak`; otherwise, `longitude` holds `undefined`.
*/
class GlobalSolarEclipseInfo {
    constructor(kind, peak, distance, latitude, longitude) {
        this.kind = kind;
        this.peak = peak;
        this.distance = distance;
        this.latitude = latitude;
        this.longitude = longitude;
    }
}


function EclipseKindFromUmbra(k) {
    // The umbra radius tells us what kind of eclipse the observer sees.
    // If the umbra radius is positive, this is a total eclipse. Otherwise, it's annular.
    // HACK: I added a tiny bias (14 meters) to match Espenak test data.
    return (k > 0.014) ? 'total' : 'annular';
}


function GeoidIntersect(shadow) {
    let kind = 'partial';
    let peak = shadow.time;
    let distance = shadow.r;
    let latitude;       // left undefined for partial eclipses
    let longitude;      // left undefined for partial eclipses

    // We want to calculate the intersection of the shadow axis with the Earth's geoid.
    // First we must convert EQJ (equator of J2000) coordinates to EQD (equator of date)
    // coordinates that are perfectly aligned with the Earth's equator at this
    // moment in time.
    const rot = Astronomy.Rotation_EQJ_EQD(shadow.time);
    const v = Astronomy.RotateVector(rot, shadow.dir);       // shadow-axis vector in equator-of-date coordinates
    const e = Astronomy.RotateVector(rot, shadow.target);    // lunacentric Earth in equator-of-date coordinates

    // Convert all distances from AU to km.
    // But dilate the z-coordinates so that the Earth becomes a perfect sphere.
    // Then find the intersection of the vector with the sphere.
    // See p 184 in Montenbruck & Pfleger's "Astronomy on the Personal Computer", second edition.
    v.x *= KM_PER_AU;
    v.y *= KM_PER_AU;
    v.z *= KM_PER_AU / EARTH_FLATTENING;
    e.x *= KM_PER_AU;
    e.y *= KM_PER_AU;
    e.z *= KM_PER_AU / EARTH_FLATTENING;

    // Solve the quadratic equation that finds whether and where
    // the shadow axis intersects with the Earth in the dilated coordinate system.
    const R = EARTH_EQUATORIAL_RADIUS_KM;
    const A = v.x*v.x + v.y*v.y + v.z*v.z;
    const B = -2.0 * (v.x*e.x + v.y*e.y + v.z*e.z);
    const C = (e.x*e.x + e.y*e.y + e.z*e.z) - R*R;
    const radic = B*B - 4*A*C;

    if (radic > 0.0) {
        // Calculate the closer of the two intersection points.
        // This will be on the day side of the Earth.
        const u = (-B - Math.sqrt(radic)) / (2 * A);

        // Convert lunacentric dilated coordinates to geocentric coordinates.
        const px = u*v.x - e.x;
        const py = u*v.y - e.y;
        const pz = (u*v.z - e.z) * EARTH_FLATTENING;

        // Convert cartesian coordinates into geodetic latitude/longitude.
        const proj = Math.sqrt(px*px + py*py) * (EARTH_FLATTENING * EARTH_FLATTENING);
        if (proj == 0.0) {
            latitude = (pz > 0.0) ? +90.0 : -90.0;
        } else {
            latitude = RAD2DEG * Math.atan(pz / proj);
        }

        // Adjust longitude for Earth's rotation at the given UT.
        const gast = sidereal_time(peak);
        longitude = (RAD2DEG * Math.atan2(py, px) - (15*gast)) % 360.0;
        if (longitude <= -180.0) {
            longitude += 360.0;
        } else if (longitude > +180.0) {
            longitude -= 360.0;
        }

        // We want to determine whether the observer sees a total eclipse or an annular eclipse.
        // We need to perform a series of vector calculations...
        // Calculate the inverse rotation matrix, so we can convert EQD to EQJ.
        const inv = Astronomy.InverseRotation(rot);

        // Put the EQD geocentric coordinates of the observer into the vector 'o'.
        // Also convert back from kilometers to astronomical units.
        let o = new Vector(px / KM_PER_AU, py / KM_PER_AU, pz / KM_PER_AU, shadow.time);

        // Rotate the observer's geocentric EQD back to the EQJ system.
        o = Astronomy.RotateVector(inv, o);

        // Convert geocentric vector to lunacentric vector.
        o.x += shadow.target.x;
        o.y += shadow.target.y;
        o.z += shadow.target.z;

        // Recalculate the shadow using a vector from the Moon's center toward the observer.
        const surface = CalcShadow(MOON_POLAR_RADIUS_KM, shadow.time, o, shadow.dir);

        // If we did everything right, the shadow distance should be very close to zero.
        // That's because we already determined the observer 'o' is on the shadow axis!
        if (surface.r > 1.0e-9 || surface.r < 0.0) {
            throw `Unexpected shadow distance from geoid intersection = ${surface.r}`;
        }

        kind = EclipseKindFromUmbra(surface.k);
    }

    return new GlobalSolarEclipseInfo(kind, peak, distance, latitude, longitude);
}


/**
 * @brief Searches for the next lunar eclipse in a series.
 *
 * After using {@link Astronomy.SearchLunarEclipse} to find the first lunar eclipse
 * in a series, you can call this function to find the next consecutive lunar eclipse.
 * Pass in the `center` value from the {@link Astronomy.LunarEclipseInfo} returned by the
 * previous call to `Astronomy.SearchLunarEclipse` or `Astronomy.NextLunarEclipse`
 * to find the next lunar eclipse.
 *
 * @param {Astronomy.AstroTime} prevEclipseTime
 *      A date and time near a full moon. Lunar eclipse search will start at the next full moon.
 *
 * @returns {Astronomy.LunarEclipseInfo}
 */
Astronomy.NextLunarEclipse = function(prevEclipseTime) {
    const startTime = prevEclipseTime.AddDays(10);
    return Astronomy.SearchLunarEclipse(startTime);
}

/**
 * @brief Searches for a solar eclipse visible anywhere on the Earth's surface.
 *
 * This function finds the first solar eclipse that occurs after `startTime`.
 * A solar eclipse may be partial, annular, or total.
 * See {@link Astronomy.GlobalSolarEclipseInfo} for more information.
 * To find a series of solar eclipses, call this function once,
 * then keep calling {@link Astronomy.NextGlobalSolarEclipse} as many times as desired,
 * passing in the `peak` value returned from the previous call.
 *
 * @param {Astronomy.AstroTime} startTime
 *      The date and time for starting the search for a solar eclipse.
 *
 * @returns {Astronomy.GlobalSolarEclipseInfo}
 */
Astronomy.SearchGlobalSolarEclipse = function(startTime) {
    const PruneLatitude = 1.8;      // Moon's ecliptic latitude beyond which eclipse is impossible
    // Iterate through consecutive new moons until we find a solar eclipse visible somewhere on Earth.
    let nmtime = startTime;
    let nmcount;
    for (nmcount=0; nmcount < 12; ++nmcount) {
        // Search for the next new moon. Any eclipse will be near it.
        const newmoon = Astronomy.SearchMoonPhase(0.0, nmtime, 40.0);
        if (newmoon === null) {
            throw 'Cannot find new moon';
        }

        // Pruning: if the new moon's ecliptic latitude is too large, a solar eclipse is not possible.
        const eclip_lat = MoonEclipticLatitudeDegrees(newmoon);
        if (Math.abs(eclip_lat) < PruneLatitude) {
            // Search near the new moon for the time when the center of the Earth
            // is closest to the line passing through the centers of the Sun and Moon.
            const shadow = PeakMoonShadow(newmoon);
            if (shadow.r < shadow.p + EARTH_MEAN_RADIUS_KM) {
                // This is at least a partial solar eclipse visible somewhere on Earth.
                // Try to find an intersection between the shadow axis and the Earth's oblate geoid.
                return GeoidIntersect(shadow);
            }
        }

        // We didn't find an eclipse on this new moon, so search for the next one.
        nmtime = newmoon.AddDays(10.0);
    }

    // Safety valve to prevent infinite loop.
    // This should never happen, because at least 2 solar eclipses happen per year.
    throw 'Failed to find solar eclipse within 12 full moons.';
}


/**
 * @brief Searches for the next global solar eclipse in a series.
 *
 * After using {@link Astronomy.SearchGlobalSolarEclipse} to find the first solar eclipse
 * in a series, you can call this function to find the next consecutive solar eclipse.
 * Pass in the `peak` value from the {@link Astronomy.GlobalSolarEclipseInfo} returned by the
 * previous call to `SearchGlobalSolarEclipse` or `NextGlobalSolarEclipse`
 * to find the next solar eclipse.
 *
 * @param {Astronomy.AstroTime} prevEclipseTime
 *      A date and time near a new moon. Solar eclipse search will start at the next new moon.
 *
 * @returns {Astronomy.GlobalSolarEclipseInfo}
 */
Astronomy.NextGlobalSolarEclipse = function(prevEclipseTime) {
    const startTime = prevEclipseTime.AddDays(10.0);
    return Astronomy.SearchGlobalSolarEclipse(startTime);
}


/**
 * @brief Holds a time and the observed altitude of the Sun at that time.
 *
 * When reporting a solar eclipse observed at a specific location on the Earth
 * (a "local" solar eclipse), a series of events occur. In addition
 * to the time of each event, it is important to know the altitude of the Sun,
 * because each event may be invisible to the observer if the Sun is below
 * the horizon (i.e. it at night).
 *
 * If `altitude` is negative, the event is theoretical only; it would be
 * visible if the Earth were transparent, but the observer cannot actually see it.
 * If `altitude` is positive but less than a few degrees, visibility will be impaired by
 * atmospheric interference (sunrise or sunset conditions).
 *
 * @class
 * @memberof Astronomy
 *
 * @property {Astronomy.AstroTime} time
 *      The date and time of the event.
 *
 * @property {number} altitude
 *      The angular altitude of the center of the Sun above/below the horizon, at `time`,
 *      corrected for atmospheric refraction and expressed in degrees.
 */
class EclipseEvent {
    constructor(time, altitude) {
        this.time = time;
        this.altitude = altitude;
    }
}


/**
 * @brief Information about a solar eclipse as seen by an observer at a given time and geographic location.
 *
 * Returned by {@link Astronomy.SearchLocalSolarEclipse} or {@link Astronomy.NextLocalSolarEclipse}
 * to report information about a solar eclipse as seen at a given geographic location.
 *
 * When a solar eclipse is found, it is classified by setting `kind`
 * to `"partial"`, `"annular"`, or `"total"`.
 * A partial solar eclipse is when the Moon does not line up directly enough with the Sun
 * to completely block the Sun's light from reaching the observer.
 * An annular eclipse occurs when the Moon's disc is completely visible against the Sun
 * but the Moon is too far away to completely block the Sun's light; this leaves the
 * Sun with a ring-like appearance.
 * A total eclipse occurs when the Moon is close enough to the Earth and aligned with the
 * Sun just right to completely block all sunlight from reaching the observer.
 *
 * There are 5 "event" fields, each of which contains a time and a solar altitude.
 * Field `peak` holds the date and time of the center of the eclipse, when it is at its peak.
 * The fields `partial_begin` and `partial_end` are always set, and indicate when
 * the eclipse begins/ends. If the eclipse reaches totality or becomes annular,
 * `total_begin` and `total_end` indicate when the total/annular phase begins/ends.
 * When an event field is valid, the caller must also check its `altitude` field to
 * see whether the Sun is above the horizon at the time indicated by the `time` field.
 * See #EclipseEvent for more information.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {string} kind
 *      The type of solar eclipse found: `"partial"`, `"annular"`, or `"total"`.
 *
 * @property {Astronomy.EclipseEvent} partial_begin
 *      The time and Sun altitude at the beginning of the eclipse.
 *
 * @property {Astronomy.EclipseEvent} total_begin
 *      If this is an annular or a total eclipse, the time and Sun altitude when annular/total phase begins; otherwise undefined.
 *
 * @property {Astronomy.EclipseEvent} peak
 *      The time and Sun altitude when the eclipse reaches its peak.
 *
 * @property {Astronomy.EclipseEvent} total_end
 *      If this is an annular or a total eclipse, the time and Sun altitude when annular/total phase ends; otherwise undefined.
 *
 * @property {Astronomy.EclipseEvent} partial_end
 *      The time and Sun altitude at the end of the eclipse.
 */
class LocalSolarEclipseInfo {
    constructor(kind, partial_begin, total_begin, peak, total_end, partial_end) {
        this.kind = kind;
        this.partial_begin = partial_begin;
        this.total_begin = total_begin;
        this.peak = peak;
        this.total_end = total_end;
        this.partial_end = partial_end;
    }
}


function local_partial_distance(shadow) {
    return shadow.p - shadow.r;
}

function local_total_distance(shadow) {
    // Must take the absolute value of the umbra radius 'k'
    // because it can be negative for an annular eclipse.
    return Math.abs(shadow.k) - shadow.r;
}


function LocalEclipse(shadow, observer) {
    const PARTIAL_WINDOW = 0.2;
    const TOTAL_WINDOW = 0.01;
    const peak = CalcEvent(observer, shadow.time);
    let t1 = shadow.time.AddDays(-PARTIAL_WINDOW);
    let t2 = shadow.time.AddDays(+PARTIAL_WINDOW);
    const partial_begin = LocalEclipseTransition(observer, +1.0, local_partial_distance, t1, shadow.time);
    const partial_end   = LocalEclipseTransition(observer, -1.0, local_partial_distance, shadow.time, t2);
    let total_begin, total_end, kind;

    if (shadow.r < Math.abs(shadow.k)) {     // take absolute value of 'k' to handle annular eclipses too.
        t1 = shadow.time.AddDays(-TOTAL_WINDOW);
        t2 = shadow.time.AddDays(+TOTAL_WINDOW);
        total_begin = LocalEclipseTransition(observer, +1.0, local_total_distance, t1, shadow.time);
        total_end = LocalEclipseTransition(observer, -1.0, local_total_distance, shadow.time, t2);
        kind = EclipseKindFromUmbra(shadow.k);
    } else {
        kind = 'partial';
    }

    return new LocalSolarEclipseInfo(kind, partial_begin, total_begin, peak, total_end, partial_end);
}


function LocalEclipseTransition(observer, direction, func, t1, t2) {
    function evaluate(time) {
        const shadow = LocalMoonShadow(time, observer);
        return direction * func(shadow);
    }
    const search = Astronomy.Search(evaluate, t1, t2, 1.0);
    if (search == null)
        throw "Local eclipse transition search failed.";
    return CalcEvent(observer, search);
}

function CalcEvent(observer, time) {
    const altitude = SunAltitude(time, observer);
    return new EclipseEvent(time, altitude);
}

function SunAltitude(time, observer) {
    const equ = Astronomy.Equator('Sun', time, observer, true, true);
    const hor = Astronomy.Horizon(time, observer, equ.ra, equ.dec, 'normal');
    return hor.altitude;
}


/**
 * @brief Searches for a solar eclipse visible at a specific location on the Earth's surface.
 *
 * This function finds the first solar eclipse that occurs after `startTime`.
 * A solar eclipse may be partial, annular, or total.
 * See {@link Astronomy.LocalSolarEclipseInfo} for more information.
 *
 * To find a series of solar eclipses, call this function once,
 * then keep calling {@link Astronomy.NextLocalSolarEclipse} as many times as desired,
 * passing in the `peak` value returned from the previous call.
 *
 * IMPORTANT: An eclipse reported by this function might be partly or
 * completely invisible to the observer due to the time of day.
 * See {@link Astronomy.LocalSolarEclipseInfo} for more information about this topic.
 *
 * @param {Astronomy.AstroTime} startTime
 *      The date and time for starting the search for a solar eclipse.
 *
 * @param {Astronomy.Observer} observer
 *      The geographic location of the observer.
 *
 * @returns {Astronomy.LocalSolarEclipseInfo}
 */
Astronomy.SearchLocalSolarEclipse = function(startTime, observer) {
    VerifyObserver(observer);
    const PruneLatitude = 1.8;   /* Moon's ecliptic latitude beyond which eclipse is impossible */

    /* Iterate through consecutive new moons until we find a solar eclipse visible somewhere on Earth. */
    let nmtime = startTime;
    for(;;) {
        /* Search for the next new moon. Any eclipse will be near it. */
        const newmoon = Astronomy.SearchMoonPhase(0.0, nmtime, 40.0);

        /* Pruning: if the new moon's ecliptic latitude is too large, a solar eclipse is not possible. */
        const eclip_lat = MoonEclipticLatitudeDegrees(newmoon);
        if (Math.abs(eclip_lat) < PruneLatitude) {
            /* Search near the new moon for the time when the observer */
            /* is closest to the line passing through the centers of the Sun and Moon. */
            const shadow = PeakLocalMoonShadow(newmoon, observer);
            if (shadow.r < shadow.p) {
                /* This is at least a partial solar eclipse for the observer. */
                const eclipse = LocalEclipse(shadow, observer);

                /* Ignore any eclipse that happens completely at night. */
                /* More precisely, the center of the Sun must be above the horizon */
                /* at the beginning or the end of the eclipse, or we skip the event. */
                if (eclipse.partial_begin.altitude > 0.0 || eclipse.partial_end.altitude > 0.0)
                    return eclipse;
            }
        }

        /* We didn't find an eclipse on this new moon, so search for the next one. */
        nmtime = newmoon.AddDays(10.0);
    }
}


/**
 * @brief Searches for the next local solar eclipse in a series.
 *
 * After using {@link Astronomy.SearchLocalSolarEclipse} to find the first solar eclipse
 * in a series, you can call this function to find the next consecutive solar eclipse.
 * Pass in the `peak` value from the {@link Astronomy.LocalSolarEclipseInfo} returned by the
 * previous call to `SearchLocalSolarEclipse` or `NextLocalSolarEclipse`
 * to find the next solar eclipse.
 * This function finds the first solar eclipse that occurs after `startTime`.
 * A solar eclipse may be partial, annular, or total.
 * See {@link Astronomy.LocalSolarEclipseInfo} for more information.
 *
 * @param {Astronomy.AstroTime} prevEclipseTime
 *      The date and time for starting the search for a solar eclipse.
 *
 * @param {Astronomy.Observer} observer
 *      The geographic location of the observer.
 *
 * @returns {Astronomy.LocalSolarEclipseInfo}
 */
Astronomy.NextLocalSolarEclipse = function(prevEclipseTime, observer) {
    const startTime = prevEclipseTime.AddDays(10.0);
    return Astronomy.SearchLocalSolarEclipse(startTime, observer);
}


/**
 * @brief Information about a transit of Mercury or Venus, as seen from the Earth.
 *
 * Returned by {@link Astronomy.SearchTransit} or {@link Astronomy.NextTransit} to report
 * information about a transit of Mercury or Venus.
 * A transit is when Mercury or Venus passes between the Sun and Earth so that
 * the other planet is seen in silhouette against the Sun.
 *
 * The calculations are performed from the point of view of a geocentric observer.
 *
 * @class
 * @memberof Astronomy
 *
 * @property {Astronomy.AstroTime} start
 *      The date and time at the beginning of the transit.
 *      This is the moment the planet first becomes visible against the Sun in its background.
 *
 * @property {Astronomy.AstroTime} peak
 *      When the planet is most aligned with the Sun, as seen from the Earth.
 *
 * @property {Astronomy.AstroTime} finish
 *      The date and time at the end of the transit.
 *      This is the moment the planet is last seen against the Sun in its background.
 *
 * @property {number} separation;
 *      The minimum angular separation, in arcminutes, between the centers of the Sun and the planet.
 *      This angle pertains to the time stored in `peak`.
 */
class TransitInfo {
    constructor(start, peak, finish, separation) {
        this.start = start;
        this.peak = peak;
        this.finish = finish;
        this.separation = separation;
    }
}


function PlanetShadowBoundary(time, body, planet_radius_km, direction) {
    const shadow = PlanetShadow(body, planet_radius_km, time);
    return direction * (shadow.r - shadow.p);
}


function PlanetTransitBoundary(body, planet_radius_km, t1, t2, direction) {
    // Search for the time the planet's penumbra begins/ends making contact with the center of the Earth.
    const tx = Astronomy.Search(time => PlanetShadowBoundary(time, body, planet_radius_km, direction), t1, t2, 1.0);
    if (tx == null)
        throw 'Planet transit boundary search failed';

    return tx;
}


/**
 * @brief Searches for the first transit of Mercury or Venus after a given date.
 *
 * Finds the first transit of Mercury or Venus after a specified date.
 * A transit is when an inferior planet passes between the Sun and the Earth
 * so that the silhouette of the planet is visible against the Sun in the background.
 * To continue the search, pass the `finish` time in the returned structure to
 * {@link Astronomy.NextTransit}.
 *
 * @param {string} body
 *      The planet whose transit is to be found. Must be `"Mercury"` or `"Venus"`.
 *
 * @param {Astronomy.AstroTime} startTime
 *      The date and time for starting the search for a transit.
 *
 * @returns {Astronomy.TransitInfo}
 */
Astronomy.SearchTransit = function(body, startTime) {
    const threshold_angle = 0.4;     // maximum angular separation to attempt transit calculation
    const dt_days = 1.0;

    // Validate the planet and find its mean radius.
    let planet_radius_km;
    switch (body)
    {
        case 'Mercury':
            planet_radius_km = 2439.7;
            break;

        case 'Venus':
            planet_radius_km = 6051.8;
            break;

        default:
            throw `Invalid body: ${body}`;
    }

    let search_time = startTime;
    for(;;) {
        // Search for the next inferior conjunction of the given planet.
        // This is the next time the Earth and the other planet have the same
        // ecliptic longitude as seen from the Sun.
        const conj = Astronomy.SearchRelativeLongitude(body, 0.0, search_time);

        // Calculate the angular separation between the body and the Sun at this time.
        const conj_separation = Astronomy.AngleFromSun(body, conj);

        if (conj_separation < threshold_angle) {
            // The planet's angular separation from the Sun is small enough
            // to consider it a transit candidate.
            // Search for the moment when the line passing through the Sun
            // and planet are closest to the Earth's center.
            const shadow = PeakPlanetShadow(body, planet_radius_km, conj);

            if (shadow.r < shadow.p) {      // does the planet's penumbra touch the Earth's center?
                // Find the beginning and end of the penumbral contact.
                const time_before = shadow.time.AddDays(-dt_days);
                const start = PlanetTransitBoundary(body, planet_radius_km, time_before, shadow.time, -1.0);
                const time_after = shadow.time.AddDays(+dt_days);
                const finish = PlanetTransitBoundary(body, planet_radius_km, shadow.time, time_after, +1.0);
                const min_separation = 60.0 * Astronomy.AngleFromSun(body, shadow.time);
                return new TransitInfo(start, shadow.time, finish, min_separation);
            }
        }

        // This inferior conjunction was not a transit. Try the next inferior conjunction.
        search_time = conj.AddDays(10.0);
    }
}


/**
 * @brief Searches for another transit of Mercury or Venus.
 *
 * After calling {@link Astronomy.SearchTransit} to find a transit of Mercury or Venus,
 * this function finds the next transit after that.
 * Keep calling this function as many times as you want to keep finding more transits.
 *
 * @param {string} body
 *      The planet whose transit is to be found. Must be `"Mercury"` or `"Venus"`.
 *
 * @param {Astronomy.AstroTime} prevTransitTime
 *      A date and time near the previous transit.
 *
 * @returns {Astronomy.TransitInfo}
 */
Astronomy.NextTransit = function(body, prevTransitTime) {
    const startTime = prevTransitTime.AddDays(100.0);
    return Astronomy.SearchTransit(body, startTime);
}


})(typeof exports==='undefined' ? (this.Astronomy={}) : exports);
