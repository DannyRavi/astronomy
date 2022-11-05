#!/usr/bin/env python3
import sys
import os
import re

class Event:
    def __init__(self, kind, body, lon, lat, utc):
        self.kind = kind
        self.body = body
        self.lon = lon
        self.lat = lat
        self.utc = utc

    def __lt__(self, other):
        if self.body != other.body:
            return self.body < other.body
        if self.lat != other.lat:
            return self.lat < other.lat
        if self.lon != other.lon:
            return self.lon < other.lon
        return self.utc < other.utc

    def __str__(self):
        return '{:4s} {:4.0f} {:3.0f} {} {}'.format(self.body, self.lon, self.lat, self.utc, self.kind)

def Emit(evtlist, kind, body, lon, lat, year, month, day, time):
    if re.match(r'\d{4}', time):
        hour = int(time[0:2])
        minute = int(time[2:4])
        utc = '{:04d}-{:02d}-{:02d}T{:02d}:{:02d}Z'.format(year, month, day, hour, minute)
        evtlist.append(Event(kind, body, lon, lat, utc))

def Convert(infilename, evtlist):
    with open(infilename, 'rt') as infile:
        for line in infile:
            line = line.strip()
            # Location: E075 00, N15 00                          Rise and Set for the Sun for 1750                   U. S. Naval Observatory
            m = re.match(r'^Location:\s*([EW]?)(\d+)\s+(\d+),\s*([NS]?)(\d+)\s+(\d+)\s+Rise and Set for the (\S+) for (\d{4})', line)
            if m:
                lon = int(m.group(2)) + int(m.group(3))/60.0
                if m.group(1) == 'W':
                    lon *= -1
                lat = int(m.group(5)) + int(m.group(6))/60.0
                if m.group(4) == 'S':
                    lat *= -1
                body = m.group(7)
                year = int(m.group(8))
                continue

            m = re.match(r'^([0-3][0-9])\s\s', line)
            if m:
                dayOfMonth = int(m.group(1))
                text = line[4:]
                data = [ (text[11*n:11*n+4].strip(), text[11*n+5:11*n+9].strip()) for n in range(12)]
                month = 0
                for (r, s) in data:
                    month += 1
                    Emit(evtlist, 'r', body, lon, lat, year, month, dayOfMonth, r)
                    Emit(evtlist, 's', body, lon, lat, year, month, dayOfMonth, s)
                continue

def ConvertAll():
    evtlist = []
    for fn in os.listdir():
        if fn.endswith('.html'):
            Convert(fn, evtlist)
    evtlist.sort()
    with open('riseset.txt', 'wt') as outfile:
        for evt in evtlist:
            outfile.write(str(evt) + '\n')

if __name__ == '__main__':
    ConvertAll()
    sys.exit(0)
