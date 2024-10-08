/*
    calendar.ts   -   Don Cross   -   2021-05-09

    A demo of using Astronomy Engine to find a series of
    interesting events for a calendar.
*/

import {
    AstroTime, Body, Observer,
    GeoVector, EquatorFromVector, Constellation, ConstellationInfo,
    PairLongitude,
    SearchHourAngle,
    SearchLocalSolarEclipse, NextLocalSolarEclipse, LocalSolarEclipseInfo,
    SearchLunarApsis, NextLunarApsis, Apsis,
    SearchLunarEclipse, NextLunarEclipse, LunarEclipseInfo,
    SearchMaxElongation,
    SearchMoonQuarter, NextMoonQuarter, MoonQuarter,
    SearchPlanetApsis, NextPlanetApsis,
    SearchPeakMagnitude,
    SearchRelativeLongitude,
    SearchRiseSet,
    SearchTransit, NextTransit, TransitInfo,
    Seasons,
} from "./astronomy";


class AstroEvent {
    constructor(
        public time: AstroTime,
        public title: string,
        public creator: AstroEventEnumerator)
        {}
}


interface AstroEventEnumerator {
    FindFirst(startTime: AstroTime): AstroEvent;
    FindNext(): AstroEvent;
}


class EventCollator implements AstroEventEnumerator {
    private eventQueue: AstroEvent[];

    constructor(private enumeratorList: AstroEventEnumerator[]) {}

    FindFirst(startTime: AstroTime): AstroEvent {
        this.eventQueue = [];
        for (let enumerator of this.enumeratorList)
            this.InsertEvent(enumerator.FindFirst(startTime));
        return this.FindNext();
    }

    FindNext(): AstroEvent {
        if (this.eventQueue.length === 0)
            return null;

        const evt = this.eventQueue.shift();
        const another = evt.creator.FindNext();
        this.InsertEvent(another);
        return evt;
    }

    InsertEvent(evt: AstroEvent): void {
        if (evt !== null) {
            // Insert the event in time order -- after anything that happens before it.

            let i = 0;
            while (i < this.eventQueue.length && this.eventQueue[i].time.tt < evt.time.tt)
                ++i;

            this.eventQueue.splice(i, 0, evt);
        }
    }
}


class RiseSetEnumerator implements AstroEventEnumerator {
    private nextSearchTime: AstroTime;

    constructor(private observer: Observer, private body: Body, private direction: number, private title: string) {}

    FindFirst(startTime: AstroTime): AstroEvent {
        this.nextSearchTime = SearchRiseSet(this.body, this.observer, this.direction, startTime, 366.0);
        if (this.nextSearchTime)
            return new AstroEvent(this.nextSearchTime, this.title, this);
        return null;
    }

    FindNext(): AstroEvent {
        if (this.nextSearchTime) {
            const startTime = this.nextSearchTime.AddDays(0.01);
            return this.FindFirst(startTime);
        }
        return null;
    }
}


class SeasonEnumerator implements AstroEventEnumerator {
    private slist: AstroEvent[];
    private year: number;
    private index: number;

    FindFirst(startTime: AstroTime): AstroEvent {
        this.year = startTime.date.getUTCFullYear();
        this.LoadYear(this.year);
        while (this.index < this.slist.length && this.slist[this.index].time.tt < startTime.tt)
            ++this.index;
        return this.FindNext();
    }

    FindNext(): AstroEvent {
        if (this.index === this.slist.length)
            this.LoadYear(++this.year);
        return this.slist[this.index++];
    }

    private LoadYear(year: number): void {
        const seasons = Seasons(year);
        this.slist = [
            new AstroEvent(seasons.mar_equinox,  'March equinox', this),
            new AstroEvent(seasons.jun_solstice, 'June solstice', this),
            new AstroEvent(seasons.sep_equinox,  'September equinox', this),
            new AstroEvent(seasons.dec_solstice, 'December solstice', this)
        ];
        this.index = 0;
    }
}


class MoonQuarterEnumerator implements AstroEventEnumerator {
    private mq: MoonQuarter;

    FindFirst(startTime: AstroTime): AstroEvent {
        this.mq = SearchMoonQuarter(startTime);
        return this.MakeEvent();
    }

    FindNext(): AstroEvent {
        this.mq = NextMoonQuarter(this.mq);
        return this.MakeEvent();
    }

    private MakeEvent(): AstroEvent {
        return new AstroEvent(
            this.mq.time,
            ['new moon', 'first quarter', 'full moon', 'third quarter'][this.mq.quarter],
            this
        );
    }
}


class ConjunctionOppositionEnumerator implements AstroEventEnumerator {
    private title: string;
    private nextTime: AstroTime;

    constructor(private body: Body, private targetRelLon: number, kind: string) {
        this.title = `${body} ${kind}`;     // e.g. "Jupiter opposition" or "Venus inferior conjunction"
    }

    FindFirst(startTime: AstroTime): AstroEvent {
        this.nextTime = startTime;
        return this.FindNext();
    }

    FindNext(): AstroEvent {
        const time = SearchRelativeLongitude(this.body, this.targetRelLon, this.nextTime);
        this.nextTime = time.AddDays(1);
        return new AstroEvent(time, this.title, this);
    }
}


class MaxElongationEnumerator implements AstroEventEnumerator {
    private nextTime: AstroTime;

    constructor(private body: Body) {}

    FindFirst(startTime: AstroTime): AstroEvent {
        this.nextTime = startTime;
        return this.FindNext();
    }

    FindNext(): AstroEvent {
        const elon = SearchMaxElongation(this.body, this.nextTime);
        this.nextTime = elon.time.AddDays(1);
        return new AstroEvent(
            elon.time,
            `${this.body} max ${elon.visibility} elongation: ${elon.elongation.toFixed(2)} degrees from Sun`,
            this);
    }
}


class VenusPeakMagnitudeEnumerator implements AstroEventEnumerator {
    private nextTime: AstroTime;

    FindFirst(startTime: AstroTime): AstroEvent {
        this.nextTime = startTime;
        return this.FindNext();
    }

    FindNext(): AstroEvent {
        const illum = SearchPeakMagnitude(Body.Venus, this.nextTime);
        const rlon = PairLongitude(Body.Venus, Body.Sun, illum.time);
        this.nextTime = illum.time.AddDays(1);
        return new AstroEvent(
            illum.time,
            `Venus peak magnitude ${illum.mag.toFixed(2)} in ${(rlon < 180) ? 'evening' : 'morning'} sky`,
            this
        );
    }
}


class LunarEclipseEnumerator implements AstroEventEnumerator {
    private nextTime: AstroTime;

    FindFirst(startTime: AstroTime): AstroEvent {
        const info = SearchLunarEclipse(startTime);
        return this.MakeEvent(info);
    }

    FindNext(): AstroEvent {
        const info = NextLunarEclipse(this.nextTime);
        return this.MakeEvent(info);
    }

    private MakeEvent(info: LunarEclipseInfo): AstroEvent {
        this.nextTime = info.peak;
        return new AstroEvent(info.peak, `${info.kind} lunar eclipse`, this);
    }
}


class LocalSolarEclipseEnumerator implements AstroEventEnumerator {
    private nextTime: AstroTime;

    constructor(private observer: Observer) {}

    FindFirst(startTime: AstroTime): AstroEvent {
        const info = SearchLocalSolarEclipse(startTime, this.observer);
        return this.MakeEvent(info);
    }

    FindNext(): AstroEvent {
        const info = NextLocalSolarEclipse(this.nextTime, this.observer);
        return this.MakeEvent(info);
    }

    private MakeEvent(info: LocalSolarEclipseInfo): AstroEvent {
        this.nextTime = info.peak.time;
        return new AstroEvent(info.peak.time, `${info.kind} solar eclipse peak at ${info.peak.altitude.toFixed(2)} degrees altitude`, this);
    }
}


class TransitEnumerator implements AstroEventEnumerator {
    private nextTime: AstroTime;

    constructor(private body: Body) {}

    FindFirst(startTime: AstroTime): AstroEvent {
        const info = SearchTransit(this.body, startTime);
        return this.MakeEvent(info);
    }

    FindNext(): AstroEvent {
        const info = NextTransit(this.body, this.nextTime);
        return this.MakeEvent(info);
    }

    private MakeEvent(info: TransitInfo): AstroEvent {
        this.nextTime = info.peak;
        return new AstroEvent(info.peak, `transit of ${this.body}`, this);
    }
}


class LunarApsisEnumerator implements AstroEventEnumerator {
    private apsis: Apsis;

    FindFirst(startTime: AstroTime): AstroEvent {
        this.apsis = SearchLunarApsis(startTime);
        return this.MakeEvent();
    }

    FindNext(): AstroEvent {
        this.apsis = NextLunarApsis(this.apsis);
        return this.MakeEvent();
    }

    private MakeEvent(): AstroEvent {
        const kind = (this.apsis.kind === 0) ? 'perigee' : 'apogee';
        return new AstroEvent(this.apsis.time, `lunar ${kind} at ${this.apsis.dist_km.toFixed(0)} km`, this);
    }
}


class PlanetApsisEnumerator implements AstroEventEnumerator {
    private apsis: Apsis;

    constructor(private body: Body) {}

    FindFirst(startTime: AstroTime): AstroEvent {
        this.apsis = SearchPlanetApsis(this.body, startTime);
        return this.MakeEvent();
    }

    FindNext(): AstroEvent {
        this.apsis = NextPlanetApsis(this.body, this.apsis);
        return this.MakeEvent();
    }

    private MakeEvent(): AstroEvent {
        const kind = (this.apsis.kind === 0) ? 'perihelion' : 'aphelion';
        return new AstroEvent(this.apsis.time, `${this.body} ${kind} at ${this.apsis.dist_au.toFixed(4)} AU`, this);
    }
}


class BodyCulminationEnumerator implements AstroEventEnumerator {
    private nextTime: AstroTime;

    constructor(private observer: Observer, private body: Body) {}

    FindFirst(startTime: AstroTime): AstroEvent {
        this.nextTime = startTime;
        return this.FindNext();
    }

    FindNext(): AstroEvent {
        const info = SearchHourAngle(this.body, this.observer, 0, this.nextTime);
        this.nextTime = info.time.AddDays(0.5);
        return new AstroEvent(info.time, `${this.body} culminates ${info.hor.altitude.toFixed(2)} degrees above the horizon`, this);
    }
}


class ConstellationEnumerator implements AstroEventEnumerator {
    private nextTime: AstroTime;
    private currentConst: ConstellationInfo;

    constructor(private body: Body, private dayIncrement: number) {}

    FindFirst(startTime: AstroTime): AstroEvent {
        this.nextTime = startTime;
        this.currentConst = this.BodyConstellation(startTime);
        return this.FindNext();
    }

    FindNext(): AstroEvent {
        const tolerance = 0.1 / (24 * 3600);    // one tenth of a second, expressed in days
        // Step through one time increment at a time until we see a constellation change.
        let t1 = this.nextTime;
        let c1 = this.currentConst;
        for(;;) {
            let t2 = t1.AddDays(this.dayIncrement);
            let c2 = this.BodyConstellation(t2);
            if (c1.symbol === c2.symbol) {
                t1 = t2;
            } else {
                // The body moved from one constellation to another during this time step.
                // Narrow in on the exact moment by doing a binary search.
                for(;;) {
                    let dt = t2.ut - t1.ut;
                    let tx = t1.AddDays(dt/2);
                    let cx = this.BodyConstellation(tx);
                    if (cx.symbol === c1.symbol) {
                        t1 = tx;
                    } else {
                        if (dt < tolerance) {
                            // We have found the transition time within tolerance.
                            // Always end the search inside the new constellation.
                            this.nextTime = tx;
                            this.currentConst = cx;
                            return new AstroEvent(tx, `${this.body} moves from ${c1.name} to ${cx.name}`, this);
                        } else {
                            t2 = tx;
                        }
                    }
                }
            }
        }
    }

    private BodyConstellation(time: AstroTime): ConstellationInfo {
        const vec = GeoVector(this.body, time, false);
        const equ = EquatorFromVector(vec);
        return Constellation(equ.ra, equ.dec);
    }
}


function RunTest(): void {
    const startTime = new AstroTime(new Date('2021-05-12T00:00:00Z'));
    const observer = new Observer(28.6, -81.2, 10.0);

    var enumeratorList: AstroEventEnumerator[] = [
        new RiseSetEnumerator(observer, Body.Sun, +1, 'sunrise'),
        new RiseSetEnumerator(observer, Body.Sun, -1, 'sunset'),
        new RiseSetEnumerator(observer, Body.Moon, +1, 'moonrise'),
        new RiseSetEnumerator(observer, Body.Moon, -1, 'moonset'),
        new BodyCulminationEnumerator(observer, Body.Sun),
        new BodyCulminationEnumerator(observer, Body.Moon),
        new SeasonEnumerator(),
        new MoonQuarterEnumerator(),
        new VenusPeakMagnitudeEnumerator(),
        new LunarEclipseEnumerator(),
        new LocalSolarEclipseEnumerator(observer),
        new LunarApsisEnumerator()
    ];

    // Inferior and superior conjunctions of inner planets.
    // Maximum elongation of inner planets.
    // Transits of inner planets.
    for (let body of [Body.Mercury, Body.Venus]) {
        enumeratorList.push(
            new ConjunctionOppositionEnumerator(body, 0, 'inferior conjunction'),
            new ConjunctionOppositionEnumerator(body, 180, 'superior conjunction'),
            new MaxElongationEnumerator(body),
            new TransitEnumerator(body)
        );
    }

    // Conjunctions and oppositions of outer planets.
    for (let body of [Body.Mars, Body.Jupiter, Body.Saturn, Body.Uranus, Body.Neptune, Body.Pluto]) {
        enumeratorList.push(
            new ConjunctionOppositionEnumerator(body, 0, 'opposition'),
            new ConjunctionOppositionEnumerator(body, 180, 'conjunction')
        );
    }

    // Perihelion and aphelion of all planets.
    // Constellation change of all planets.
    for (let body of [Body.Mercury, Body.Venus, Body.Earth, Body.Mars, Body.Jupiter, Body.Saturn, Body.Uranus, Body.Neptune, Body.Pluto]) {
        enumeratorList.push(new PlanetApsisEnumerator(body));
        if (body !== Body.Earth) {
            enumeratorList.push(new ConstellationEnumerator(body, 1));
        }
    }

    const collator = new EventCollator(enumeratorList);

    const stopYear = startTime.date.getUTCFullYear() + 12;
    let evt:AstroEvent = collator.FindFirst(startTime);
    while (evt !== null && evt.time.date.getUTCFullYear() < stopYear) {
        console.log(`${evt.time} ${evt.title}`);
        evt = collator.FindNext();
    }
}

RunTest();
