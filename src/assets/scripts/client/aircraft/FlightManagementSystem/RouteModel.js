import _chunk from 'lodash/chunk';
import _first from 'lodash/first';
import _findIndex from 'lodash/findIndex';
import _isNil from 'lodash/isNil';
import _isString from 'lodash/isString';
import _last from 'lodash/last';
import _map from 'lodash/map';
import _reduce from 'lodash/reduce';
import _without from 'lodash/without';
import LegModel from './LegModel';
import BaseModel from '../../base/BaseModel';
import NavigationLibrary from '../../navigationLibrary/NavigationLibrary';
import {
    INVALID_INDEX,
    INVALID_NUMBER,
    REGEX
} from '../../constants/globalConstants';
import {
    DIRECT_SEGMENT_DIVIDER,
    PROCEDURE_OR_AIRWAY_SEGMENT_DIVIDER
} from '../../constants/routeConstants';

/**
 * Representation of an aircraft's flight plan route
 *
 * This object contains all of the legs and waypoints the FMS will use to navigate.
 * Each instance of an Aircraft has an FMS with a `RouteModel`, that it is able
 * to modify, including adding/removing legs/waypoints, adding/removing waypoint
 * restrictions, absorbing another `RouteModel`, etc.
 *
 * @class RouteModel
 */
export default class RouteModel extends BaseModel {
    /**
     * @for RouteModel
     * @constructor
     * @param navigationLibrary {NavigationLibrary}
     * @param routeString {string}
     */
    constructor(navigationLibrary, routeString) {
        if (!(navigationLibrary instanceof NavigationLibrary)) {
            throw new TypeError(`Expected valid navigationLibrary, but received ${typeof navigationLibrary}`);
        }

        super();

        /**
         * Array of `LegModel`s on the route
         *
         * @for RouteModel
         * @property _legCollection
         * @type {array<LegModel>}
         * @private
         */
        this._legCollection = [];

        /**
         * Local reference to NavigationLibrary
         *
         * @for RouteModel
         * @property _navigationLibrary
         * @type {NavigationLibrary}
         * @private
         */
        this._navigationLibrary = navigationLibrary;

        // FIXME: Use this
        /**
         * Array of `LegModel`s that have been passed (or skipped)
         *
         * Aircraft will proceed along the route to each waypoint, and upon completion
         * of any given leg, it will move that leg here to the `#_previousLegCollection`,
         * and proceed to the next leg in the `#_legCollection` until no more `LegModel`s
         * exist, at which point they will simply hold their last assigned heading and altitude.
         *
         * @for RouteModel
         * @property _previousLegCollection
         * @type {array<WaypointModel>}
         * @private
         */
        this._previousLegCollection = [];

        this.init(routeString);
    }

    /**
     * Return the current `LegModel`
     *
     * @for RouteModel
     * @property currentLeg
     * @type {LegModel}
     */
    get currentLeg() {
        if (this._legCollection.length < 1) {
            throw new TypeError('Expected the route to contain at least one leg');
        }

        return this._legCollection[0];
    }

    /**
     * Return the current `WaypointModel`
     *
     * @for RouteModel
     * @property currentWaypoint
     * @type {WaypointModel}
     */
    get currentWaypoint() {
        return this.currentLeg.currentWaypoint;
    }

    /**
     * Return the next `LegModel`, if it exists
     *
     * @for RouteModel
     * @property nextLeg
     * @type {LegModel}
     */
    get nextLeg() {
        if (!this.hasNextLeg()) {
            return null;
        }

        return this._legCollection[1];
    }

    /**
     * Return the next `WaypointModel`, from current or future leg
     *
     * @for RouteModel
     * @property nextWaypoint
     * @type {WaypointModel}
     */
    get nextWaypoint() {
        if (!this.hasNextWaypoint()) {
            return null;
        }

        if (this.currentLeg.hasNextWaypoint()) {
            return this.currentLeg.waypoints[1];
        }

        return this.nextLeg.currentWaypoint;
    }

    /**
     * Return an array of all waypoints in all legs of the route
     *
     * @for RouteModel
     * @property waypoints
     * @type {array<WaypointModel>}
     */
    get waypoints() {
        return _reduce(this._legCollection, (waypointList, legModel) => {
            return waypointList.concat(legModel.waypoints);
        }, []);
    }

    // ------------------------------ LIFECYCLE ------------------------------

    /**
     * Initialize class properties
     *
     * @for RouteModel
     * @method init
     * @param routeString {string}
     * @chainable
     */
    init(routeString) {
        this._legCollection = this._generateLegsFromRouteString(routeString);

        return this;
    }

    /**
     * Reset class properties
     *
     * @for RouteModel
     * @method reset
     * @chainable
     */
    reset() {
        this._legCollection = [];

        return this;
    }

    // ------------------------------ PUBLIC ------------------------------

    // FIXME: COMPLETE THIS METHOD
    /**
     * Merge the provided route model into this route model, if possible
     *
     * @for RouteModel
     * @method absorbRouteModel
     * @param routeModel {RouteModel}
     */
    absorbRouteModel(/* routeModel */) {
        //
    }

    /**
     * Calculate the heading from the first waypoint to the second waypoint
     *
     * This is used to determine the heading of newly spawned aircraft
     *
     * @for RouteModel
     * @method calculateSpawnHeading
     * @return {number} heading, in radians
     */
    calculateSpawnHeading() {
        const firstWaypointPositionModel = this.waypoints[0].positionModel;
        const secondWaypointPositionModel = this.waypoints[1].positionModel;
        const heading = firstWaypointPositionModel.bearingToPosition(secondWaypointPositionModel);

        return heading;
    }

    /**
    * Return an array of waypoints in the flight plan that have altitude restrictions
    *
    * @for RouteModel
    * @method getAltitudeRestrictedWaypoints
    * @return {array<WaypointModel>}
    */
    getAltitudeRestrictedWaypoints() {
        return this.waypoints.filter((waypoint) => waypoint.hasAltitudeRestriction);
    }

    /**
     * Generate a route string for all legs in the `#_previousLegCollection` an `#_legCollection`
     *
     * @for RouteModel
     * @method getRouteString
     * @return {string}
     */
    getFullRouteString() {
        const pastAndPresentLegModels = [
            ...this._previousLegCollection,
            ...this._legCollection
        ];

        return this._calculateRouteStringForLegs(pastAndPresentLegModels);
    }

    /**
     * Return `#fullRouteString` with spaces between elements instead of dot notation
     *
     * @for RouteModel
     * @method getFullRouteStringWithSpaces
     * @return {string}
     */
    getFullRouteStringWithSpaces() {
        const routeString = this.getFullRouteString();

        return routeString.replace(DIRECT_SEGMENT_DIVIDER, ' ').replace(PROCEDURE_OR_AIRWAY_SEGMENT_DIVIDER, ' ');
    }

    /**
     * Generate a route string for all legs in the `#_legCollection`
     *
     * @for RouteModel
     * @method getRouteString
     * @return {string}
     */
    getRouteString() {
        return this._calculateRouteStringForLegs(this._legCollection);
    }

    /**
     * Return `#routeString` with spaces between elements instead of dot notation
     *
     * @for RouteModel
     * @method getRouteStringWithSpaces
     * @return {string}
     */
    getRouteStringWithSpaces() {
        const routeString = this.getRouteString();

        return routeString.replace(REGEX.DOUBLE_DOT, ' ').replace(REGEX.SINGLE_DOT, ' ');
    }

    /**
     * Returns the lowest bottom altitude of any `LegModel` in the `#_legCollection`
     *
     * @for RouteModel
     * @method getBottomAltitude
     * @return {number}
     */
    getBottomAltitude() {
        const valueToExclude = INVALID_NUMBER;
        const minAltitudeFromLegs = _without(
            _map(this._legCollection, (leg) => leg.getProcedureBottomAltitude()),
            valueToExclude
        );

        return Math.min(...minAltitudeFromLegs);
    }

    /**
     * Returns the highest top altitude of any `LegModel` in the `#_legCollection`
    *
    * @for RouteModel
    * @method getTopAltitude
    * @return {number}
    */
    getTopAltitude() {
        const maxAltitudeFromLegs = _map(this.legCollection, (leg) => leg.getProcedureTopAltitude());

        return Math.max(...maxAltitudeFromLegs);
    }

    /**
     * Whether the route has another leg after the current one
     *
     * @for RouteModel
     * @method hasNextLeg
     * @return {boolean}
     */
    hasNextLeg() {
        return this._legCollection.length > 1;
    }

    /**
     * Whether the route has another waypoint after the current one
     *
     * This includes waypoints in the current and future legs
     *
     * @for RouteModel
     * @method hasNextWaypoint
     * @return {boolean}
     */
    hasNextWaypoint() {
        if (this.currentLeg.hasNextWaypoint()) {
            return true;
        }

        if (!this.hasNextLeg()) {
            return false;
        }

        return !_isNil(this.nextLeg.currentWaypoint);
    }

    /**
     * Return whether the route contains a waypoint with the specified name
     *
     * @for RouteModel
     * @method hasWaypointName
     * @param waypointName {string}
     * @return {boolean}
     */
    hasWaypointName(waypointName) {
        for (let i = 0; i < this._legCollection.length; i++) {
            if (this._legCollection[i].hasWaypointName(waypointName)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Skip ahead to the next waypoint
     *
     * If there are no more waypoints in the `#currentLeg`, this will also cause
     * us to skip to the next leg.
     *
     * @for RouteModel
     * @method moveToNextWaypoint
     */
    moveToNextWaypoint() {
        if (!this.currentLeg.hasNextWaypoint()) {
            return this.skipToNextLeg();
        }

        this.currentLeg.moveToNextWaypoint();
    }

    /**
     * Replace the arrival procedure leg with a new one (if it exists in the route)
     *
     * // FIXME: Is this really what we want to do here?
     * This method does not remove any `LegModel`s. It instead finds and updates a
     * `LegModel` with a new routeString. If a `LegModel` with a arrival
     * procedure cannot be found, then we create a new `LegModel` and place it
     * at the end of the `#legCollection`.
     *
     * @for RouteModel
     * @method replaceArrivalProcedure
     * @param routeString {string}
     * @return {boolean} whether operation was successful
     */
    replaceArrivalProcedure(routeString) {
        let starLegModel;

        try {
            starLegModel = new LegModel(this._navigationLibrary, routeString);
        } catch (error) {
            console.error(error);

            return false;
        }

        const starLegIndex = this._findStarLegIndex();

        // if no STAR leg exists, insert the new one as the new last leg
        if (starLegIndex === INVALID_INDEX) {
            this._legCollection.push(starLegModel);

            return true;
        }

        this._legCollection[starLegIndex] = starLegModel;

        return true;
    }

    /**
     * Replace the departure procedure leg with a new one (if it exists in the route)
     *
     * // FIXME: Is this really what we want to do here?
     * This method does not remove any `LegModel`s. It instead finds and updates a
     * `LegModel` with a new routeString. If a `LegModel` with a departure
     * procedure cannot be found, then we create a new `LegModel` and place it
     * at the beginning of the `#legCollection`.
     *
     * @for RouteModel
     * @method replaceDepartureProcedure
     * @param routeString {string}
     * @return {boolean} whether operation was successful
     */
    replaceDepartureProcedure(routeString) {
        let sidLegModel;

        try {
            sidLegModel = new LegModel(this._navigationLibrary, routeString);
        } catch (error) {
            console.error(error);

            return false;
        }

        const sidLegIndex = this._findSidLegIndex();

        // if no SID leg exists, insert the new one as the new first leg
        if (sidLegIndex === INVALID_INDEX) {
            this._legCollection.unshift(sidLegModel);

            return true;
        }

        this._legCollection[sidLegIndex] = sidLegModel;

        return true;
    }

    /**
     * Move the current leg into the `#_previousLegCollection`
     *
     * This also results in the `#nextLeg` becoming the `#currentLeg`
     *
     * @for RouteModel
     * @method skipToNextLeg
     */
    skipToNextLeg() {
        if (!this.hasNextLeg()) {
            return;
        }

        const legToMove = this._legCollection.splice(0, 1);

        this._previousLegCollection.push(...legToMove);
    }

    /**
     * Skip ahead to the waypoint with the specified name, if it exists
     *
     * @for RouteModel
     * @method skipToWaypointName
     * @param waypointName {string}
     * @return {boolean} success of operation
     */
    skipToWaypointName(waypointName) {
        if (!this.hasWaypointName(waypointName)) {
            return false;
        }

        if (this.currentLeg.hasWaypointName(waypointName)) {
            this.currentLeg.skipToWaypointName(waypointName);
        }

        const legIndex = _findIndex(this._legCollection, (legModel) => legModel.hasWaypointName(waypointName));
        const legModelsToMove = this._legCollection.splice(0, legIndex);

        this._previousLegCollection.push(...legModelsToMove);

        return this.currentLeg.skipToWaypointName(waypointName);
    }

    /**
     * Ensure the STAR leg has the specified arrival runway as the exit point
     *
     * @for RouteModel
     * @method updateStarLegForArrivalRunwayModel
     * @param runwayModel {RunwayModel}
     */
    updateStarLegForArrivalRunwayModel(runwayModel) {
        const starLegIndex = this._findStarLegIndex();

        if (starLegIndex === INVALID_INDEX) {
            return;
        }

        const starLegModel = this._legCollection[starLegIndex];

        starLegModel.updateStarLegForArrivalRunwayModel(runwayModel);
    }

    /**
     * Ensure the SID leg has the specified departure runway as the entry point
     *
     * @for RouteModel
     * @method updateSidLegForDepartureRunwayModel
     * @param runwayModel {RunwayModel}
     */
    updateSidLegForDepartureRunwayModel(runwayModel) {
        const sidLegIndex = this._findSidLegIndex();

        if (sidLegIndex === INVALID_INDEX) {
            return;
        }

        const sidLegModel = this._legCollection[sidLegIndex];

        sidLegModel.updateSidLegForDepartureRunwayModel(runwayModel);
    }

    // ------------------------------ PRIVATE ------------------------------

    /**
     * Combine the route strings from all provided legs to form a route string
     *
     * This enables us to get a route string for a SPECIFIABLE series of legs, which
     * may be a portion of the `#_legCollection` or of the `#_previousLegCollection`,
     * or any combination thereof.
     *
     * @for RouteModel
     * @method _calculateRouteStringForLegs
     * @param legCollection {array<LegModel>}
     * @return {string}
     */
    _calculateRouteStringForLegs(legCollection) {
        const legRouteStrings = _map(legCollection, (legModel) => legModel.routeString);
        const directRouteSegments = [_first(legRouteStrings)];

        for (let i = 1; i < legRouteStrings.length; i++) {
            const exitOfPreviousLeg = _last(legRouteStrings[i - 1].split(PROCEDURE_OR_AIRWAY_SEGMENT_DIVIDER));
            const leg = legRouteStrings[i];
            const legEntry = _first(leg.split(PROCEDURE_OR_AIRWAY_SEGMENT_DIVIDER));

            if (legEntry === exitOfPreviousLeg) {
                const indexOfPreviousLeg = directRouteSegments.length - 1;
                const legRouteStringWithoutEntry = leg.replace(legEntry, '');
                directRouteSegments[indexOfPreviousLeg] += legRouteStringWithoutEntry;

                continue;
            }

            directRouteSegments.push(leg);
        }

        return directRouteSegments.join(DIRECT_SEGMENT_DIVIDER);
    }

    /**
     * Divide a long route string into segments that can be individually represented by a `LegModel`
     *
     * @for RouteModel
     * @method _divideRouteStringIntoSegments
     * @param routeString {string}
     * @return {array<string>}
     * @private
     */
    _divideRouteStringIntoSegments(routeString) {
        if (!_isString(routeString)) {
            throw new TypeError(`Expected routeString's type to be string, but received '${typeof routeString}'`);
        }

        if (routeString.indexOf(' ') !== INVALID_INDEX) {
            throw new TypeError(`Expected a route string that does not contain spaces, but received '${routeString}'`);
        }

        const chainedRouteStrings = routeString.split(DIRECT_SEGMENT_DIVIDER);
        const segmentRouteStrings = [];

        // deal with chained route strings (eg 'KSFO28R.OFFSH9.SXC.V458.IPL')
        for (let i = 0; i < chainedRouteStrings.length; i++) {
            const chainedRouteString = chainedRouteStrings[i];
            const elementsInChain = chainedRouteString.split(PROCEDURE_OR_AIRWAY_SEGMENT_DIVIDER);
            const firstSegment = elementsInChain.splice(0, 3);
            const segments = [
                firstSegment,
                ..._chunk(elementsInChain, 2)
            ];

            segmentRouteStrings.push(firstSegment.join(PROCEDURE_OR_AIRWAY_SEGMENT_DIVIDER));

            for (let j = 1; j < segments.length; j++) {
                const exitOfPreviousSegment = _last(segments[j - 1]);
                const procedureAndExitOfSegment = segments[j].join(PROCEDURE_OR_AIRWAY_SEGMENT_DIVIDER);

                segmentRouteStrings.push(`${exitOfPreviousSegment}.${procedureAndExitOfSegment}`);
            }
        }

        return segmentRouteStrings;
    }

    /**
     * Return the index of the SID leg
     *
     * If for some reason there are multiple, this returns the first one.
     * This search does NOT include legs in the `#_previousLegCollection`.
     *
     * @for RouteModel
     * @method _findSidLegIndex
     * @return {number}
     * @private
     */
    _findSidLegIndex() {
        return _findIndex(this._legCollection, (legModel) => legModel.isSidLeg);
    }

    /**
     * Return the index of the STAR leg within the `#_legCollection`
     *
     * If for some reason there are multiple, this returns the first one.
     * This search does NOT include legs in the `#_previousLegCollection`.
     *
     * @for RouteModel
     * @method _findStarLegIndex
     * @return {number}
     * @private
     */
    _findStarLegIndex() {
        return _findIndex(this._legCollection, (legModel) => legModel.isStarLeg);
    }

    /**
     * Generate an array of `LegModel`s according to the provided route string
     *
     * @for RouteModel
     * @method _generateLegsFromRouteString
     * @param routeString {string}
     * @return {array<LegModel>}
     * @private
     */
    _generateLegsFromRouteString(routeString) {
        const segments = this._divideRouteStringIntoSegments(routeString);
        const legs = _map(segments, (segmentRouteString) => {
            return new LegModel(this._navigationLibrary, segmentRouteString);
        });

        return legs;
    }
}