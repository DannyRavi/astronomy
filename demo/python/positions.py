#!/usr/bin/env python3
#
#   positions.py  -  by Don Cross - 2019-08-10
#
#   Example program for Astronomy Engine:
#   https://github.com/cosinekitty/astronomy
#
#   Given an observer's geographic latitude and longitude,
#   and an optional date and time, this program displays the
#   equatorial and horizontal coordinates of the Sun, Moon, and planets.
#   If the date and time is omitted from the command line, the
#   program uses the computer's current date and time.
#
import sys
from astronomy import Body, Refraction, Equator, Horizon
from astro_demo_common import ParseArgs

if __name__ == '__main__':
    observer, time = ParseArgs(sys.argv)
    print('UTC date = {}'.format(time))
    print()
    print('BODY           RA      DEC       AZ      ALT')
    body_list = [
        Body.Sun, Body.Moon, Body.Mercury, Body.Venus, Body.Mars,
        Body.Jupiter, Body.Saturn, Body.Uranus, Body.Neptune, Body.Pluto
    ]
    for body in body_list:
        equ_2000 = Equator(body, time, observer, ofdate=False, aberration=True)
        equ_ofdate = Equator(body, time, observer, ofdate=True, aberration=True)
        hor = Horizon(time, observer, equ_ofdate.ra, equ_ofdate.dec, Refraction.Normal)
        print('{:<8} {:8.2f} {:8.2f} {:8.2f} {:8.2f}'.format(body.name, equ_2000.ra, equ_2000.dec, hor.azimuth, hor.altitude))
    sys.exit(0)
