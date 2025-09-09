import { Query } from './BoolQuery';

export interface GeoLocation {
    lat: number;
    lon: number;
}

export class GeoDistanceQuery implements Query {
    public readonly field: string;
    public readonly location: GeoLocation;
    public readonly distance: string;

    constructor(field: string, location: GeoLocation, distance: string) {
        this.field = field;
        this.location = location;
        this.distance = distance;

        Object.freeze(this);
    }

    getField(): string {
        return this.field;
    }

    getLocation(): GeoLocation {
        return this.location;
    }

    getDistance(): string {
        return this.distance;
    }

    toElasticsearchQuery(): any {
        return {
            geo_distance: {
                distance: this.distance,
                [this.field]: this.location
            }
        };
    }

    toString(): string {
        return `${this.field} within ${this.distance} of (${this.location.lat}, ${this.location.lon})`;
    }

    equals(other: any): boolean {
        if (!(other instanceof GeoDistanceQuery)) {
            return false;
        }
        return this.field === other.field &&
            this.location.lat === other.location.lat &&
            this.location.lon === other.location.lon &&
            this.distance === other.distance;
    }
}