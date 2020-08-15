/*
    vsop.c  -  Don Cross  -  2019-03-24

    Loads and calculates planetary positions using VSOP87 analytic models.
    See:  https://en.wikipedia.org/wiki/VSOP_(planets)
*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "vsop.h"

static const double DAYS_PER_MILLENNIUM = 365250.0;

static void SphereToRect(double lon, double lat, double radius, double pos[3]);
static void VsopRotate(const double ecliptic[3], double equatorial[3]);

void VsopInit(vsop_model_t *model)    /* optional usage: create invalid null model that can be safely freed */
{
    memset(model, 0, sizeof(vsop_model_t));
    model->version = VSOP_INVALID_VERSION;
    model->body = VSOP_INVALID_BODY;
}

typedef struct
{
    const char *name;
    vsop_body_t body;
}
BodyItem;

static const BodyItem BodyTable[] =
{
    { "MERCURY ", VSOP_MERCURY },
    { "VENUS   ", VSOP_VENUS   },
    { "EARTH   ", VSOP_EARTH   },
    { "EMB     ", VSOP_EMB     },
    { "MARS    ", VSOP_MARS    },
    { "JUPITER ", VSOP_JUPITER },
    { "SATURN  ", VSOP_SATURN  },
    { "URANUS  ", VSOP_URANUS  },
    { "NEPTUNE ", VSOP_NEPTUNE },
    { "SUN     ", VSOP_SUN     },
    { NULL,       VSOP_INVALID_BODY }
};

int VsopLoadModel(vsop_model_t *model, const char *inFileName)
{
    int lnum, length, b;
    char line[200];
    int error = 1;
    int nterms, termcount, power, expected_ncoords;
    double A, B, C;
    FILE *infile;
    vsop_series_t *series = NULL;
    vsop_formula_t *formula = NULL;

    VsopInit(model);    /* must init before checking for any errors; otherwise will crash trying to free! */

    infile = fopen(inFileName, "rt");
    if (infile == NULL)
    {
        fprintf(stderr, "VsopLoadModel: Cannot open file: %s\n", inFileName);
        goto fail;
    }

    lnum = nterms = termcount = 0;
    while (fgets(line, sizeof(line), infile))
    {
        ++lnum;
        length = (int)strlen(line);
        if (termcount == nterms)
        {
            /* expect first/another header record */
            if (length < 67 ||
                memcmp(line, " VSOP87 VERSION ", 16) ||
                (line[17] < '0' || line[17] > '5') ||
                (line[59] < '0' || line[59] > '9') ||
                1 != sscanf(&line[60], "%d", &nterms) || (nterms < 1))
            {
                fprintf(stderr, "VsopLoadModel: bad header record: line %d, file '%s'\n", lnum, inFileName);
                goto fail;
            }
            power = line[59] - '0';

            if (lnum == 1)
            {
                /* Must keep the version so we know what the coordinates mean. */
                model->version = (vsop_version_t)(line[17] - '0');

                /* Keep the body name so caller can verify correct body is loaded. */
                /* We also use the body to determine how to scale orbital radius for truncation. */
                model->body = VSOP_INVALID_BODY;
                for (b=0; BodyTable[b].name != NULL; ++b)
                {
                    if (!memcmp(&line[22], BodyTable[b].name, 8))
                    {
                        model->body = BodyTable[b].body;
                        break;
                    }
                }
                if (model->body == VSOP_INVALID_BODY)
                {
                    fprintf(stderr, "VsopLoadModel: Invalid body name in file '%s'\n", inFileName);
                    goto fail;
                }
            }

            /*
                We are either starting the next power series in the same coordinate formula
                or the zero-power series of the first/next coordinate formula.
            */

            if (power == 0)
            {
                if (model->ncoords == VSOP_MAX_COORDS)
                {
                    fprintf(stderr, "VsopLoadModel: too many coordinates specified by file %s\n", inFileName);
                    goto fail;
                }
                formula = &model->formula[model->ncoords++];
            }

            if (formula == NULL)
            {
                fprintf(stderr, "VsopLoadModel: unexpected power %d in file %s, line %d\n", power, inFileName, lnum);
                goto fail;
            }

            if (formula->nseries_total == VSOP_MAX_SERIES)
            {
                fprintf(stderr, "VsopLoadModel: too many series in file %s, line %d\n", inFileName, lnum);
                goto fail;
            }

            if (formula->nseries_total != power)
            {
                fprintf(stderr, "VsopLoadModel: power=%d but formula->nseries=%d, file %s, line %d\n", power, formula->nseries_total, inFileName, lnum);
                goto fail;
            }

            series = &formula->series[formula->nseries_total++];
            formula->nseries_calc = formula->nseries_total;
            series->nterms_calc = series->nterms_total = nterms;
            series->term = calloc(series->nterms_total, sizeof(vsop_term_t));
            if (series->term == NULL)
            {
                fprintf(stderr, "VsopLoadModel: out of memory!\n");
                goto fail;
            }
            termcount = 0;
        }
        else
        {
            /* expect a data record */
            if (length < 131 ||
                3 != sscanf(&line[79], "%lf %lf %lf", &A, &B, &C))
            {
                fprintf(stderr, "VsopLoadModel: bad data record: line %d, file '%s'\n", lnum, inFileName);
                goto fail;
            }
            series->term[termcount].amplitude = A;
            series->term[termcount].phase = B;
            series->term[termcount].frequency = C;
            ++termcount;
        }
    }

    if (model->version == VSOP_INVALID_VERSION)
    {
        fprintf(stderr, "VsopLoadModel: bad file format in %s\n", inFileName);
        goto fail;
    }

    expected_ncoords = (model->version == VSOP_ELLIPTIC_J2000) ? 6 : 3;
    if (model->ncoords != expected_ncoords)
    {
        fprintf(stderr, "VsopLoadModel: expected %d coordinates but found %d in file %s\n", expected_ncoords, model->ncoords, inFileName);
        goto fail;
    }

    if (termcount != nterms)
    {
        fprintf(stderr, "VsopLoadModel: unexpected early end of input in file %s\n", inFileName);
        goto fail;
    }

    error = 0;  /* success */

fail:
    if (infile != NULL)
        fclose(infile);

    if (error)
        VsopFreeModel(model);

    return error;
}

void VsopFreeModel(vsop_model_t *model)
{
    int k, s;

    for (k=0; k < VSOP_MAX_COORDS; ++k)
        for (s=0; s < VSOP_MAX_SERIES; ++s)
            free(model->formula[k].series[s].term);

    VsopInit(model);
}

static double Millennia(double tt)
{
    return tt / DAYS_PER_MILLENNIUM;     /* t = number of millennia after J2000 */
}


static void VsopCoords(const vsop_model_t *model, double t, double coords[])
{
    int k, s, i;

    for (k=0; k < model->ncoords; ++k)
    {
        double tpower = 1.0;
        const vsop_formula_t *formula = &model->formula[k];
        coords[k] = 0.0;
        for (s=0; s < formula->nseries_calc; ++s)
        {
            double sum = 0.0;
            const vsop_series_t *series = &formula->series[s];
            for (i=0; i < series->nterms_calc; ++i)
            {
                const vsop_term_t *term = &series->term[i];
                sum += term->amplitude * cos(term->phase + (t * term->frequency));
            }
            coords[k] += tpower * sum;
            tpower *= t;
        }
    }
}


static void VsopDeriv(const vsop_model_t *model, double t, double deriv[])
{
    int k, s, i;

    for (k=0; k < model->ncoords; ++k)
    {
        double tpower = 1.0;        /* t^s */
        double dpower = 0.0;        /* t^(s-1) */
        const vsop_formula_t *formula = &model->formula[k];
        deriv[k] = 0.0;
        for (s=0; s < formula->nseries_calc; ++s)
        {
            double sin_sum = 0.0;
            double cos_sum = 0.0;
            const vsop_series_t *series = &formula->series[s];
            for (i=0; i < series->nterms_calc; ++i)
            {
                const vsop_term_t *term = &series->term[i];
                double angle = term->phase + (t * term->frequency);
                sin_sum += term->amplitude * term->frequency * sin(angle);
                if (s > 0)
                    cos_sum += term->amplitude * cos(angle);
            }
            deriv[k] += (s * dpower * cos_sum) - (tpower * sin_sum);
            dpower = tpower;
            tpower *= t;
        }
    }
}


int VsopCalcPos(const vsop_model_t *model, double tt, double pos[3])
{
    double t = Millennia(tt);
    double coords[VSOP_MAX_COORDS];
    double eclip[3];

    if (model->ncoords < 3 || model->ncoords > VSOP_MAX_COORDS)
    {
        fprintf(stderr, "VsopCalcPos(ERROR): model->ncoords = %d is not valid!\n", model->ncoords);
        return 1;
    }

    VsopCoords(model, t, coords);

    switch (model->version)
    {
    case VSOP_HELIO_RECT_J2000:
    case VSOP_HELIO_RECT_DATE:
        eclip[0] = coords[0];
        eclip[1] = coords[1];
        eclip[2] = coords[2];
        break;

    case VSOP_HELIO_SPHER_J2000:
    case VSOP_HELIO_SPHER_DATE:
        SphereToRect(coords[0], coords[1], coords[2], eclip);
        break;

    default:
        fprintf(stderr, "VsopCalc: Version %d coordinates not implemented.\n", model->version);
        return 1;
    }

    VsopRotate(eclip, pos);     /* convert ecliptic coordinates to equatorial coordinates */
    return 0;
}


int VsopCalcPosVel(const vsop_model_t *model, double tt, double pos[3], double vel[3])
{
    double t = Millennia(tt);
    double coords[3];   /* lon, lat, r */
    double deriv[3];    /* d(lon)/dt, d(lat)/dt, dr/dt */
    double eclip[3];    /* ecliptic (x, y, z) */
    double dr_dt, dlat_dt, dlon_dt;
    double r, coslat, coslon, sinlat, sinlon;

    /* Calculate position and velocity vectors, but only for the spherical "B" models. */

    if (model->version != VSOP_HELIO_SPHER_J2000)
    {
        fprintf(stderr, "VsopCalcPosVel: Version %d coordinates not implemented.\n", model->version);
        return 1;
    }

    if (model->ncoords != 3)
    {
        fprintf(stderr, "VsopCalcPosVel: Expected 3 coordinates but found %d\n", model->ncoords);
        return 1;
    }

    /* Calculate position the same way VsopCalcPos does. */
    VsopCoords(model, t, coords);
    SphereToRect(coords[0], coords[1], coords[2], eclip);
    VsopRotate(eclip, pos);

    /* Calculate the time derivatives of the 3 spherical coordinates. */
    VsopDeriv(model, t, deriv);

    /* Use spherical coords and spherical derivatives to calculate */
    /* the velocity vector in rectangular coordinates. */

    /* Calculate mnemonic variables to help keep the math straight. */
    coslon = cos(coords[0]);
    sinlon = sin(coords[0]);
    coslat = cos(coords[1]);
    sinlat = sin(coords[1]);
    r = coords[2];
    dlon_dt = deriv[0];
    dlat_dt = deriv[1];
    dr_dt   = deriv[2];

    /* vx = dx/dt */
    eclip[0] = (dr_dt * coslat * coslon) - (r * sinlat * coslon * dlat_dt) - (r * coslat * sinlon * dlon_dt);

    /* vy = dy/dt */
    eclip[1] = (dr_dt * coslat * sinlon) - (r * sinlat * sinlon * dlat_dt) + (r * coslat * coslon * dlon_dt);

    /* vz = dz/dt */
    eclip[2] = (dr_dt * sinlat) + (r * coslat * dlat_dt);

    /* Rotate the velocity vector from ecliptic to equatorial coordinates. */
    VsopRotate(eclip, vel);

    /* Convert speed units from [AU/millennium] to [AU/day]. */
    vel[0] /= DAYS_PER_MILLENNIUM;
    vel[1] /= DAYS_PER_MILLENNIUM;
    vel[2] /= DAYS_PER_MILLENNIUM;

    return 0;
}


static void SphereToRect(double lon, double lat, double radius, double pos[3])
{
    double r_coslat = radius * cos(lat);
    pos[0] = r_coslat * cos(lon);
    pos[1] = r_coslat * sin(lon);
    pos[2] = radius * sin(lat);
}

static void VsopRotate(const double ecliptic[3], double equatorial[3])
{
    /*
        X        +1.000000000000  +0.000000440360  -0.000000190919   X
        Y     =  -0.000000479966  +0.917482137087  -0.397776982902   Y
        Z FK5     0.000000000000  +0.397776982902  +0.917482137087   Z VSOP87A
    */
    equatorial[0] = ecliptic[0] + 0.000000440360*ecliptic[1] - 0.000000190919*ecliptic[2];
    equatorial[1] = -0.000000479966*ecliptic[0] + 0.917482137087*ecliptic[1] - 0.397776982902*ecliptic[2];
    equatorial[2] = 0.397776982902*ecliptic[1] + 0.917482137087*ecliptic[2];
}

static double Power(double t, int n)
{
    int i;
    double p = 1.0;

    for (i=0; i < n; ++i)
        p *= t;

    return p;
}

static int ModelTypeScaling(const vsop_model_t *model, int k, double *scaling)
{
    /*
        Calculate a scaling factor to fairly weigh different kinds of coordinates for a given body.
        We want to normalize how important each coordinate is for angular errors as seen from Earth.
    */

    *scaling = 0.0;

    switch (model->version)
    {
    case VSOP_HELIO_RECT_J2000:
    case VSOP_HELIO_RECT_DATE:
        break;  /* fall through to AU distance metric */

    case VSOP_HELIO_SPHER_J2000:
    case VSOP_HELIO_SPHER_DATE:
        if (k==0 || k==1)
        {
            *scaling = 1.0;     /* all angular measures are equally important for a given body */
            return 0;
        }
        break;  /* fall through to AU distance metric */

    case VSOP_ELLIPTIC_J2000:
    case VSOP_BARY_RECT_J2000:
    default:
        fprintf(stderr, "vsop!ModelTypeScaling(): model->version = %d not supported\n", model->version);
        return 1;
    }

    /* Use the body's typical distance from the Sun to scale how important a distance coordinate is. */
    /* The further from the Sun, the more error we can tolerate. */
    switch (model->body)
    {
    case VSOP_MERCURY:  *scaling = 0.387098;  break;
    case VSOP_VENUS:    *scaling = 0.723332;  break;
    case VSOP_EARTH:    *scaling = 1.000000;  break;
    case VSOP_EMB:      *scaling = 1.000000;  break;
    case VSOP_MARS:     *scaling = 1.523679;  break;
    case VSOP_JUPITER:  *scaling = 5.2044;    break;
    case VSOP_SATURN:   *scaling = 9.5826;    break;
    case VSOP_URANUS:   *scaling = 19.2184;   break;
    case VSOP_NEPTUNE:  *scaling = 30.11;     break;
    default:
        fprintf(stderr, "vsop!ModelTypeScaling: Invalid body %d\n", model->body);
        return 1;
    }
    return 0;
}

int VsopTruncate(vsop_model_t *model, double tt1, double tt2, double amplitudeThreshold)
{
    /*
        Over the specified J2000 terrestrial time range [tt1, tt2],
        chop off as many small-order terms as possible without exceeding
        the specified threshold of error in total amplitudes.
    */
    double t1 = fabs(Millennia(tt1));
    double t2 = fabs(Millennia(tt2));
    double t = (t1 > t2) ? t1 : t2;         /* maximum possible |t| over the given time span */
    int k, s;

    /* Reset all nterms_calc to nterms, undoing any previous truncation. */
    for (k=0; k < model->ncoords; ++k)
    {
        vsop_formula_t *formula = &model->formula[k];
        formula->nseries_calc = formula->nseries_total;
        for (s = 0; s < formula->nseries_total; ++s)
        {
            vsop_series_t *series = &formula->series[s];
            series->nterms_calc = series->nterms_total;
        }
    }

    for (k=0; k < model->ncoords; ++k)
    {
        vsop_formula_t *formula = &model->formula[k];
        double accum = 0.0;
        double scaled_threshold;
        if (ModelTypeScaling(model, k, &scaled_threshold)) return 1;
        scaled_threshold *= amplitudeThreshold;
        for(;;)
        {
            /* Search for smallest remaining term that can be removed without exceeding the amplitude threshold. */
            vsop_series_t *s_best = NULL;
            double incr_best = -1.0;
            for (s = 0; s < formula->nseries_calc; ++s)
            {
                double tpower = Power(t, s);
                vsop_series_t *series = &formula->series[s];
                if (series->nterms_calc > 0)
                {
                    const vsop_term_t *term = &series->term[series->nterms_calc - 1];
                    double increment = tpower * fabs(term->amplitude);
                    if (s_best == NULL || increment < incr_best)
                    {
                        s_best = series;
                        incr_best = increment;
                    }
                }
            }

            if (s_best == NULL || accum + incr_best > scaled_threshold)
                break;      /* no more terms can be removed, or we have hit threshold for this coordinate */

            accum += incr_best;
            --(s_best->nterms_calc);
        }
    }

    return 0;
}

void VsopTrim(vsop_model_t *model)
{
    int k;

    /*
        If there are any trailing empty series in a formula, remove them.
        Cannot remove empty series that are not at the end, because
        it messes up calculation of powers of t.
        This used to be part of VsopTruncate, but now I want the ability
        to re-expand parts of a VSOP model before trimming it.
    */

    for (k=0; k < model->ncoords; ++k)
    {
        vsop_formula_t *formula = &model->formula[k];
        while (formula->nseries_calc > 0 && formula->series[formula->nseries_calc-1].nterms_calc == 0)
            --(formula->nseries_calc);
    }
}

int VsopTermCount(const vsop_model_t *model)
{
    /* Count up the total number of cosine terms in the truncated model. */
    int k, s, termcount;

    termcount = 0;
    for (k=0; k < model->ncoords; ++k)
    {
        const vsop_formula_t *formula = &model->formula[k];
        for (s=0; s < formula->nseries_calc; ++s)
            termcount += formula->series[s].nterms_calc;
    }

    return termcount;
}

int VsopWriteTrunc(const vsop_model_t *model, const char *outFileName)
{
    int error = 1;
    int k, s, i;
    FILE *outfile;

    outfile = fopen(outFileName, "wt");
    if (outfile == NULL)
    {
        fprintf(stderr, "VsopWriteTrunc: Cannot open output file: %s\n", outFileName);
        goto fail;
    }

    fprintf(outfile, "TRUNC_VSOP87 version=%d body=%d ncoords=%d\n", model->version, model->body, model->ncoords);
    for (k=0; k < model->ncoords; ++k)
    {
        const vsop_formula_t *formula = &model->formula[k];
        fprintf(outfile, "    coord=%d, nseries=%d\n", k, formula->nseries_calc);
        for (s = 0; s < formula->nseries_calc; ++s)
        {
            const vsop_series_t *series = &formula->series[s];
            fprintf(outfile, "        series=%d, nterms=%d\n", s, series->nterms_calc);
            for (i = 0; i < series->nterms_calc; ++i)
            {
                const vsop_term_t *term = &series->term[i];

                /* Match the exact precision in the original VSOP87 file for printing the coefficients. */
                fprintf(outfile, "        %7d %18.11lf %14.11lf %20.11lf\n", i, term->amplitude, term->phase, term->frequency);
            }
        }
    }
    error = 0;
fail:
    if (outfile != NULL) fclose(outfile);
    return error;
}

#define PARSELINE(x)    do { \
    ++lnum; \
    if (!fgets(line, sizeof(line), infile)) \
    { \
        fprintf(stderr, "VsopReadTrunc: Error reading line %d from file %s\n", lnum, inFileName);  \
        error = 1;  \
        goto fail; \
    } \
    if (!(x)) { \
        fprintf(stderr, "VsopReadTrunc: Bad syntax on line %d of file %s\n", lnum, inFileName); \
        error = 1; \
        goto fail; \
    } \
} while(0)

int VsopReadTrunc(vsop_model_t *model, const char *inFileName)
{
    int error;
    int lnum = 0;
    int k, s, i;
    int check_k, check_s, check_i;
    FILE *infile;
    char line[200];

    VsopInit(model);

    infile = fopen(inFileName, "rt");
    if (infile == NULL)
    {
        fprintf(stderr, "VsopReadTrunc: Cannot open input file '%s'\n", inFileName);
        error = 1;
        goto fail;
    }

    PARSELINE(
        (3 == sscanf(line, "TRUNC_VSOP87 version=%d body=%d ncoords=%d", &model->version, &model->body, &model->ncoords))
        && (model->ncoords >= VSOP_MIN_COORDS)
        && (model->ncoords <= VSOP_MAX_COORDS)
    );

    for (k = 0; k < model->ncoords; ++k)
    {
        vsop_formula_t *formula = &model->formula[k];

        PARSELINE(
            2 == sscanf(line, " coord=%d, nseries=%d", &check_k, &formula->nseries_total)
            && check_k == k
            && formula->nseries_total >= 0
            && formula->nseries_total < VSOP_MAX_SERIES);

        formula->nseries_calc = formula->nseries_total;

        for (s = 0; s < formula->nseries_total; ++s)
        {
            vsop_series_t *series = &formula->series[s];

            PARSELINE(
                2 == sscanf(line, " series=%d, nterms=%d", &check_s, &series->nterms_total)
                && check_s == s);

            series->nterms_calc = series->nterms_total;
            series->term = calloc(series->nterms_total, sizeof(vsop_term_t));
            if (series->term == NULL)
            {
                fprintf(stderr, "VsopReadTrunc: memory allocation failure!\n");
                error = 1;
                goto fail;
            }

            for (i = 0; i < series->nterms_total; ++i)
            {
                vsop_term_t *term = &series->term[i];
                PARSELINE(
                    4 == sscanf(line, " %d %lf %lf %lf", &check_i, &term->amplitude, &term->phase, &term->frequency)
                    && check_i == i
                );
            }
        }
    }

    error = 0;
fail:
    if (infile != NULL) fclose(infile);
    if (error) VsopFreeModel(model);
    return error;
}
