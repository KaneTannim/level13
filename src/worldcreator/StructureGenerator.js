// Handles the first step of world generation, the abstract world template itself
define([
	'ash',
    'game/constants/PositionConstants',
    'game/constants/WorldConstants',
    'game/vos/PositionVO',
	'worldcreator/WorldCreatorConstants',
    'worldcreator/WorldCreatorHelper',
    'worldcreator/WorldCreatorRandom',
    'worldcreator/SectorVO',
], function (Ash, PositionConstants, WorldConstants, PositionVO, WorldCreatorConstants, WorldCreatorHelper, WorldCreatorRandom, SectorVO) {
    
    var StructureGenerator = {
        
        prepareStructure: function (seed, worldVO) {
            this.currentFeatures = worldVO.features;
			for (var l = worldVO.topLevel; l >= worldVO.bottomLevel; l--) {
                var levelVO = worldVO.levels[l];
                this.createLevelStructure(seed, worldVO, levelVO);
            }
            this.currentFeatures = null;
        },
        
        createLevelStructure: function(seed, worldVO, levelVO) {
            var l = levelVO.level;
            var stages = worldVO.getStages(l);

            // create central structure
            this.createCentralStructure(seed, worldVO, levelVO);
            
            // create required paths
            var requiredPaths = this.getRequiredPaths(worldVO, levelVO);
            this.createRequiredPaths(seed, worldVO, levelVO, requiredPaths);

            // create random shapes to fill the level
            for (var i = 0; i < stages.length; i++) {
                var stageVO = stages[i];
                this.generateLevelStage(seed, worldVO, levelVO, stageVO);
            }
            
            // fill in annoying gaps (connect sectors that are close by direct distance but far by path length)
            this.createGapFills(worldVO, levelVO);
        },
        
        createCentralStructure: function (seed, worldVO, levelVO) {
            var l = levelVO.level;
            var s1 = (seed % 4 + 1) * 11 + (l + 9) * 666;
            var s2 = (seed % 6 + 1) * 9 + (l + 7) * 331;
            var s3 = (seed % 3 + 1) * 5 + (l + 11) * 561;
            var position = new PositionVO(l, 0, 0);
            var sr = 10000 + seed % 100 + l * 66 + levelVO.campOrdinal * 22 + levelVO.numSectors;
            var rand = WorldCreatorRandom.random(sr);
            if (rand < 0.15) {
                // parallel streets + connection
                var max = Math.min(4, Math.round(levelVO.numSectors/25));
                var num = WorldCreatorRandom.randomInt(s1, 2, max + 1);
                var minlen = Math.min(11 + (max - num) * 2, levelVO.numSectors / 10);
                var maxlenstep = Math.min(5, Math.round(levelVO.numSectors / 20));
                var len = minlen + WorldCreatorRandom.randomInt(s2, 0, maxlenstep) * 2;
                var dir = WorldCreatorRandom.randomDirections(s2 / 2, 1, num < 3)[0];
                var dist = 3 + WorldCreatorRandom.randomInt(s1, 0, 4);
                var oppositeDir = PositionConstants.getOppositeDirection(dir);
                var perpendicularDir = PositionConstants.getNextClockWise(PositionConstants.getNextClockWise(dir, true), true);
                var getStreetCenter = function (i) {
                    var streetDist = -(num-1)*dist/2 + i*dist;
                    return PositionConstants.getPositionOnPath(position, perpendicularDir, streetDist);
                };
                for (var i = 0; i < num; i++) {
                    var streetCenter = getStreetCenter(i);
                    var startPos = PositionConstants.getPositionOnPath(streetCenter, oppositeDir, Math.floor(len / 2));
                    this.createPath(levelVO, startPos, dir, len, true);
                }
                if (num > 1) {
                    var street1Center = getStreetCenter(0);
                    var offset1 = WorldCreatorRandom.randomInt(s1, -len/2, len/2);
                    var connectionPoint1 = PositionConstants.getPositionOnPath(street1Center, oppositeDir, offset1);
                    this.createPath(levelVO, connectionPoint1, perpendicularDir, dist * (num-1) + 1, true);
                    var offset2 = WorldCreatorRandom.randomInt(s2, -len/2, len/2);
                    if (Math.abs(offset1 - offset2) > 2) {
                        var connectionPoint2 = PositionConstants.getPositionOnPath(street1Center, oppositeDir, offset2);
                        this.createPath(levelVO, connectionPoint2, perpendicularDir, dist * (num-1) + 1, true);
                    }
                }
            } else if (rand < 0.3) {
                // crossings
                var numx = WorldCreatorRandom.randomInt(s1, 1, 3);
                var numy = WorldCreatorRandom.randomInt(s2, 1, 3);
                var isDiagonal = WorldCreatorRandom.random(s3) < 0.9;
                var xlen = 7 + WorldCreatorRandom.randomInt(s2, 0, 7) * 2;
                var xdist = 2 + WorldCreatorRandom.randomInt(s1, 0, 6);
                var xdir = PositionConstants.DIRECTION_EAST;
                for (var i = 0; i < numx; i++) {
                    var startPos = new PositionVO(l, position.sectorX-xlen/2, position.sectorY-(numx-1)*xdist/2 + i*xdist);
                    this.createPath(levelVO, startPos, xdir, xlen, true);
                }
                var ylen = 7 + WorldCreatorRandom.randomInt(s1, 0, 7) * 2;
                var ydist = 2 + WorldCreatorRandom.randomInt(s2, 0, 6);
                var ydir = PositionConstants.DIRECTION_SOUTH;
                for (var j = 0; j < numy; j++) {
                    var startPos = new PositionVO(l, position.sectorX-(numy-1)*ydist/2 + j*ydist, position.sectorY-ylen/2);
                    this.createPath(levelVO, startPos, ydir, ylen, true);
                }
            } else if (rand < 0.45) {
                // two rectangles vertical / horizontal
                var connected = WorldCreatorRandom.randomBool(s1);
                var horizontal = WorldCreatorRandom.randomBool(s2);
                var size = 5 + WorldCreatorRandom.randomInt(s2, 0, 2) * 2;
                var mindist = Math.floor(size / 2);
                var dist = connected ? mindist : mindist + WorldCreatorRandom.randomInt(s2, 1, 3) * 2;
                var x = horizontal ? dist : 0;
                var y = horizontal ? 0 : dist;
                this.createRectangleFromCenter(levelVO, 0, new PositionVO(l, position.sectorX+x, position.sectorY+y), size, size, true);
                this.createRectangleFromCenter(levelVO, 0, new PositionVO(l, position.sectorX-x, position.sectorY-y), size, size, true);
                if (!connected) {
                    var pathpos = WorldCreatorRandom.randomInt(s1, Math.ceil(-dist/2), Math.floor(dist/2));
                    var pathdist = Math.ceil(-dist + size/2);
                    var pathx = horizontal ? pathdist : pathpos;
                    var pathy = horizontal ? pathpos : pathdist;
                    var pathdir = horizontal ? PositionConstants.DIRECTION_EAST : PositionConstants.DIRECTION_SOUTH;
                    this.createPath(levelVO, new PositionVO(l, position.sectorX + pathx, position.sectorY + pathy), pathdir, dist, true);
                }
            } else if (rand < 0.6) {
                // central plaza
                var size = 3;
                var corner = Math.floor(size / 2) + 1;
                this.createRectangleFromCenter(levelVO, 0, position, 3, 3);
                this.createSector(levelVO, new PositionVO(levelVO.level, corner, corner));
                this.createSector(levelVO, new PositionVO(levelVO.level, -corner, corner));
                this.createSector(levelVO, new PositionVO(levelVO.level, -corner, -corner));
                this.createSector(levelVO, new PositionVO(levelVO.level, corner, -corner));
            } else if (rand < 0.7) {
                // double rectangle
                var isDiagonal = WorldCreatorRandom.random(s1) < 0.15;
                var minSize = 3;
                var maxSize = levelVO.numSectors / 10;
                var maxStep = Math.floor(maxSize - minSize) / 2;
                var innerS = minSize + WorldCreatorRandom.randomInt(s1, 0, Math.min(5, maxStep)) * 2;
                var outerS = innerS + 4 + WorldCreatorRandom.randomInt(s2, 0, 4) * 2;
                this.createRectangleFromCenter(levelVO, 0, position, innerS, innerS, false, isDiagonal);
                this.createRectangleFromCenter(levelVO, 0, position, outerS, outerS, false, isDiagonal);
            } else {
                // single rectangle
                var isDiagonal = WorldCreatorRandom.random(s1) < 0.25;
                var size = 5 + WorldCreatorRandom.randomInt(s2, 0, 5) * 2;
                this.createRectangleFromCenter(levelVO, 0, position, size, size, false, isDiagonal);
            }
        },
        
        generateLevelStage: function (seed, worldVO, levelVO, stageVO) {
            var attempts = 0;
            var maxAttempts = 1000;
            var maxSectors = WorldCreatorHelper.getNumSectorsForLevelStage(worldVO, levelVO, stageVO.stage);
            while (levelVO.getNumSectorsByStage(stageVO.stage) <= maxSectors && attempts < maxAttempts) {
                attempts++;
                var canConnectToDifferentStage = attempts > 5 && attempts % 5 == 0 && stageVO.stage != WorldConstants.CAMP_STAGE_EARLY;
                var options = this.getDefaultOptions({ stage: stageVO.stage, canConnectToDifferentStage: canConnectToDifferentStage });
                if (attempts % 2 !== 0) {
                    this.createRectangles(seed, attempts, levelVO, options);
                } else {
                    this.createPaths(seed, attempts, levelVO, options);
                }
            }
        },
        
        createRequiredPaths: function (seed, worldVO, levelVO, requiredPaths) {
            if (requiredPaths.length === 0) return;
            var path;
            var startPos;
            var endPos;
            for (var i = 0; i < requiredPaths.length; i++) {
                path = requiredPaths[i];
                startPos = path.start.clone();
                endPos = path.end.clone();
                // generate required path
                var existingSectors = levelVO.sectors.concat();
                var options1 = this.getDefaultOptions({ stage: path.stage, criticalPathType: path.type});
                var path = this.createPathBetween(seed, levelVO, startPos, endPos, path.maxlen, options1);
                // ensure new path is connected to the rest of the level
                if (existingSectors.length > 0) {
                    worldVO.resetPaths();
                    var pathToCenter = WorldCreatorRandom.findPath(worldVO, startPos, existingSectors[0].position, false, true);
                    if (!pathToCenter) {
                        var pair = WorldCreatorHelper.getClosestPair(existingSectors, path);
                        var pairDist = PositionConstants.getDistanceTo(pair[0].position, pair[1].position);
                        var options2 = this.getDefaultOptions();
                        this.createPathBetween(seed, levelVO, pair[0].position, pair[1].position, -1, options2);
                    }
                }
            }
        },

        createRectangles: function (seed, pathSeed, levelVO, options) {
            var l = levelVO.levelOrdinal;
            var pathRandomSeed = levelVO.sectors.length * 4 + l + pathSeed * 5;
            var startingPosArray = this.getPathStartingPositions(levelVO, options);
            var pathStartingI = Math.floor(WorldCreatorRandom.random(seed * 938 * (l + 60) / pathRandomSeed + 2342 * l) * startingPosArray.length);
            var pathStartingPos = startingPosArray[pathStartingI].position.clone();

            var isDiagonal = WorldCreatorRandom.random(seed + (l * 44) * pathRandomSeed + pathSeed) < WorldCreatorConstants.DIAGONAL_PATH_PROBABILITY;
            var numRectangles = WorldCreatorRandom.randomInt((seed + pathRandomSeed * l - pathRandomSeed) / (pathSeed + 5), 1, 5);
            var startDirections = WorldCreatorRandom.randomDirections(seed * levelVO.levelOrdinal + 28381 + pathRandomSeed, numRectangles, false);
            var maxRectangleSize = WorldCreatorConstants.SECTOR_PATH_LENGTH_MAX / 2;
            var w = WorldCreatorRandom.randomInt(seed + pathRandomSeed / pathSeed + pathSeed * l, 4, maxRectangleSize);
            var h = WorldCreatorRandom.randomInt(seed + pathRandomSeed * l + pathSeed - pathSeed * l, 4, maxRectangleSize);

            var startDirection;
            for (var i = 0; i < numRectangles; i++) {
                if (!this.createRectangle(levelVO, i, pathStartingPos, w, h, null, options))
                    break;
            }
        },

        createRectangleFromCenter: function (levelVO, i, center, w, h, forceComplete, isDiagonal) {
            if (isDiagonal) {
                var corner = new PositionVO(center.level, center.sectorX, Math.round(center.sectorY - h));
                this.createRectangle(levelVO, i, corner, w, h, PositionConstants.DIRECTION_SE, null, forceComplete);
            } else {
                var corner = new PositionVO(center.level, Math.round(center.sectorX - w / 2), Math.round(center.sectorY - h / 2));
                this.createRectangle(levelVO, i, corner, w, h, PositionConstants.DIRECTION_EAST, null, forceComplete);
            }
        },

        createRectangle: function (levelVO, i, startPos, w, h, startDirection, options, forceComplete) {
            startDirection = startDirection || WorldCreatorRandom.randomDirections(i, 1, true)[0];
            var sideStartPos = startPos;
            var currentDirection = startDirection;
            for (var j = 0; j < 4; j++) {
                var sideLength = PositionConstants.isHorizontalDirection(currentDirection) ? w : h;
                var result = this.createPath(levelVO, sideStartPos, currentDirection, sideLength, forceComplete, options);
                if (!result.completed) return false;
                sideStartPos = PositionConstants.getPositionOnPath(sideStartPos, currentDirection, sideLength - 1);
                currentDirection = PositionConstants.getNextClockWise(currentDirection, false);
            }
            return true;
        },
        
        createPathBetween: function (seed, levelVO, startPos, endPos, maxlen, options) {
            var l = levelVO.level;
            var dist = Math.ceil(PositionConstants.getDistanceTo(startPos, endPos));
            var result = [];
            
            var pathLength;
            var totalLength = dist;
            if (dist == 0) {
                this.createAddSector(result, levelVO, startPos, options);
            } else if (dist == 1) {
                this.createAddSector(result, levelVO, startPos, options);
                this.createAddSector(result, levelVO, endPos, options);
            } else {
                var allowDiagonals = WorldCreatorRandom.randomBool(50000 + (l + 5) * 55 + dist * 555);
                var currentPos = startPos;
                var pathResult;
                var i = 0;
                while (!currentPos.equals(endPos)) {
                    var possibleDirections = PositionConstants.getDirectionsFrom(currentPos, endPos, allowDiagonals);
                    var directionIndex = WorldCreatorRandom.randomInt(seed % 10200 + l * 555 + dist * 77 + i * 1001, 0, possibleDirections.length);
                    var direction = possibleDirections[directionIndex];
                    pathLength = PositionConstants.getDistanceInDirection(currentPos, endPos, direction) + 1;
                    pathResult = this.createPath(levelVO, currentPos, direction, pathLength, true, options);
                    result = result.concat(pathResult.path);
                    if (!pathResult.completed) break;
                    currentPos = PositionConstants.getPositionOnPath(currentPos, direction, pathLength - 1);
                    i++;
                    if (i > 100) break;
                }
            }
            
            return result;
        },

        createPaths: function (seed, pathSeed, levelVO, options) {
            var l = levelVO.levelOrdinal;
            var pathRandomSeed = levelVO.sectors.length * 4 + l + pathSeed * 5;
            var startingPosArray = this.getPathStartingPositions(levelVO, options);
            var pathStartingI = Math.floor(WorldCreatorRandom.random(seed * 938 * (l + 60) / pathRandomSeed + 2342 * l) * startingPosArray.length);
            var pathStartingPos = startingPosArray[pathStartingI].position.clone();

            var canBeDiagonal = WorldCreatorRandom.random(seed + (l + 70) * pathRandomSeed) < WorldCreatorConstants.DIAGONAL_PATH_PROBABILITY;
            var pathDirections = WorldCreatorRandom.randomDirections(seed * levelVO.levelOrdinal + 28381 + pathRandomSeed, 1, canBeDiagonal);

            var pathLength;
            for (var di = 0; di < pathDirections.length; di++) {
                pathLength = WorldCreatorRandom.randomInt(seed * 3 * pathRandomSeed * (di + 1) + (di + 3) * l + 55, WorldCreatorConstants.SECTOR_PATH_LENGTH_MIN, WorldCreatorConstants.SECTOR_PATH_LENGTH_MAX);
                this.createPath(levelVO, pathStartingPos, pathDirections[di], pathLength, null, options);
            }
        },

        createPath: function (levelVO, startPos, direction, len, forceComplete, options) {
            if (len < 1) return { path: [], completed: false };
            var result = [];

            var requiresWater = true;
            var requiresFood = true;
            var sectorPos;
            for (var si = 0; si < len; si++) {
                sectorPos = PositionConstants.getPositionOnPath(startPos, direction, si);
                sectorPos.level = levelVO.level;

                var sectorExists = levelVO.hasSector(sectorPos.sectorX, sectorPos.sectorY);

                // stop path when intersecting existing paths
                if (!forceComplete) {
                    var sectorHasUnmatchingNeighbours = false;
                    var neighbours = levelVO.getNeighbours(sectorPos.sectorX, sectorPos.sectorY);
                    if (neighbours[PositionConstants.DIRECTION_EAST] && neighbours[PositionConstants.DIRECTION_SOUTH]) sectorHasUnmatchingNeighbours = true;
                    if (neighbours[PositionConstants.DIRECTION_EAST] && neighbours[PositionConstants.DIRECTION_NORTH]) sectorHasUnmatchingNeighbours = true;
                    if (neighbours[PositionConstants.DIRECTION_WEST] && neighbours[PositionConstants.DIRECTION_SOUTH]) sectorHasUnmatchingNeighbours = true;
                    if (neighbours[PositionConstants.DIRECTION_WEST] && neighbours[PositionConstants.DIRECTION_NORTH]) sectorHasUnmatchingNeighbours = true;
                    if (sectorExists || sectorHasUnmatchingNeighbours || Object.keys(neighbours).length > 4) {
                        if (si > 0) {
                            return { path: result, completed: false };
                        } else {
                            continue;
                        }
                    }
                }

                if (sectorExists) {
                    result.push(levelVO.getSector(sectorPos.sectorX, sectorPos.sectorY));
                    continue;
                }

                var sectorResult = this.createSector(levelVO, sectorPos, options);
                
                if (sectorResult.vo) {
	                result.push(sectorResult.vo);
                } else {
                    return { path: result, completed: false };
                }
            }
            return { path: result, completed: true };
        },

        createGapFills: function (worldVO, levelVO) {
            var getFurthestPair = function () {
                var furthestPathDist = 0;
                var furthestPair = [null, null];
                for (var i = 0; i < levelVO.sectors.length; i++) {
                    var sector1 = levelVO.sectors[i];
                    for (var j = i; j < levelVO.sectors.length; j++) {
                        var sector2 = levelVO.sectors[j];
                        if (sector1.stage != sector2.stage) continue;
                        var dist = PositionConstants.getDistanceTo(sector1.position, sector2.position);
                        if (dist > 1 && dist < 3) {
                            var path = WorldCreatorRandom.findPath(worldVO, sector1.position, sector2.position, false, true);
                            var pathDist = path ? path.length : -1;
                            if (pathDist > furthestPathDist) {
                                furthestPathDist = pathDist;
                                furthestPair = [sector1, sector2];
                            }
                        }
                    }
                }
                return { sectors: furthestPair, pathDist: furthestPathDist };
            }
            
            var currentPair = getFurthestPair();
            
            var i = 0;
            while (currentPair.pathDist > 15 && i < 100) {
                var sectors = this.createPathBetween(i, levelVO, currentPair.sectors[0].position, currentPair.sectors[1].position);
                for (var j = 0; j < sectors.length; j++) {
                    sectors[j].isFill = true;
                }
                worldVO.resetPaths();
                currentPair = getFurthestPair();
                i++;
                if (levelVO.sectors.length >= levelVO.maxSectors) break;
            }
        },
        
        createAddSector: function (arr, levelVO, sectorPos, options) {
            var sectorResult = this.createSector(levelVO, sectorPos, options);
            if (sectorResult.vo) {
                arr.push(sectorResult.vo);
            }
        },

		createSector: function (levelVO, sectorPos, options) {
            sectorPos.normalize();
            options = options || this.getDefaultOptions();
            var stage = options.stage || this.getDefaultStage(levelVO, sectorPos);
            var criticalPathType = options.criticalPathType;
            var sectorVO = levelVO.getSector(sectorPos.sectorX, sectorPos.sectorY);
            var exists = sectorVO != null;
            var created = false;
            
            if (!exists) {
                var validResult = this.isValidSectorPosition(levelVO, sectorPos, stage, options);
                if (validResult.isValid) {
        			sectorVO = new SectorVO(sectorPos, levelVO.isCampable, levelVO.notCampableReason);
                    sectorVO.stage = stage;
                    sectorVO.isCamp = levelVO.isCampPosition(sectorPos);
                    sectorVO.isPassageUp = levelVO.isPassageUpPosition(sectorPos);
                    sectorVO.isPassageDown = levelVO.isPassageDownPosition(sectorPos);
                    if (criticalPathType) {
                        sectorVO.addToCriticalPath(criticalPathType);
                    }
        			created = levelVO.addSector(sectorVO);
                } else {
                    log.w("invalid sector pos: " + sectorPos + " " + stage + " " + validResult.reason);
                }
            }
            return { isNew: created, vo: sectorVO };
		},
        
        isValidSectorPosition: function (levelVO, sectorPos, stage, options) {
            // blocking features
            //if (WorldCreatorHelper.containsBlockingFeature(sectorPos, this.currentFeatures)) return { isValid: false, reason: "feature" };
            // blocking stage elements
            if (!options.criticalPathType) {
                for (var levelStage in levelVO.stageCenterPositions) {
                    if (levelStage == stage) continue;
                    var positions = levelVO.stageCenterPositions[levelStage];
                    for (var i = 0; i < positions.length; i++) {
                        var pos = positions[i];
                        var dist = PositionConstants.getDistanceTo(pos, sectorPos);
                        if (dist < 2) {
                            return { isValid: false, reason: "stage" };
                        }
                    }
                }
            }
            // too far from center
            var excursionLen = WorldCreatorConstants.getMaxPathLength(levelVO.campOrdinal, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_POI_2);
            if (PositionConstants.getDistanceTo(sectorPos, levelVO.levelCenterPosition) > excursionLen) return { isValid: false, reason: "excursion length" };
            return { isValid: true };
        },
        
        getRequiredPaths: function (worldVO, levelVO) {
            var level = levelVO.level;
            var campOrdinal = levelVO.campOrdinal;
            var campPositions = levelVO.campPositions;
            var passageUpPosition = levelVO.passageUpPosition;
            var passageDownPosition = levelVO.passageDownPosition;
            
            var maxPathLenP2P = WorldCreatorConstants.getMaxPathLength(campOrdinal, WorldCreatorConstants.CRITICAL_PATH_TYPE_PASSAGE_TO_PASSAGE);
            var maxPathLenC2P = WorldCreatorConstants.getMaxPathLength(campOrdinal, WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE);
            
            var requiredPaths = [];
            
            if (campPositions.length > 0) {
                // passages up -> camps -> passages down
                var isGoingDown = level <= 13 && level >= worldVO.bottomLevel;
                var passageUpPathType = isGoingDown ? WorldCreatorConstants.CRITICAL_PATH_TYPE_PASSAGE_TO_CAMP : WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE;
                var passageUpStage = isGoingDown ? WorldConstants.CAMP_STAGE_EARLY : null;
                var passageDownPathType = isGoingDown ? WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE : WorldCreatorConstants.CRITICAL_PATH_TYPE_PASSAGE_TO_CAMP;
                var passageDownStage = isGoingDown ? null : WorldConstants.CAMP_STAGE_EARLY;
                if (level == 13) {
                    passageUpPathType = WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE;
                    passageUpStage = null;
                    passageDownPathType = WorldCreatorConstants.CRITICAL_PATH_TYPE_CAMP_TO_PASSAGE;
                    passageDownStage = null;
                }
                for (var i = 1; i < campPositions.length; i++) {
                    requiredPaths.push({ start: campPositions[0], end: campPositions[i], maxlen: -1, type: "camp_pos_to_camp_pos", stage: WorldConstants.CAMP_STAGE_EARLY });
                }
                if (passageUpPosition) {
                    var closerCamp = WorldCreatorHelper.getClosestPosition(campPositions, passageUpPosition);
                    requiredPaths.push({ start: closerCamp, end: passageUpPosition, maxlen: maxPathLenC2P, type: passageUpPathType, stage: passageUpStage });
                }
                if (passageDownPosition) {
                    var closerCamp = WorldCreatorHelper.getClosestPosition(campPositions, passageDownPosition);
                    requiredPaths.push({ start: closerCamp, end: passageDownPosition, maxlen: maxPathLenC2P, type: passageDownPathType, stage: passageDownStage });
                }
            } else if (!passageUpPosition) {
                // just passage down sector
                if (passageDownPosition) {
                    requiredPaths.push({ start: passageDownPosition, end: passageDownPosition, maxlen: 1, type: WorldCreatorConstants.CRITICAL_PATH_TYPE_PASSAGE_TO_PASSAGE, stage: WorldConstants.CAMP_STAGE_LATE });
                }
            } else if (!passageDownPosition) {
                // just passage up sector
                if (passageUpPosition) {
                    requiredPaths.push({ start: passageUpPosition, end: passageUpPosition, maxlen: 1, type: WorldCreatorConstants.CRITICAL_PATH_TYPE_PASSAGE_TO_PASSAGE, stage: WorldConstants.CAMP_STAGE_LATE });
                }
            } else {
                // passage up -> passage down
                requiredPaths.push({ start: passageUpPosition, end: passageDownPosition, maxlen: maxPathLenP2P, type: WorldCreatorConstants.CRITICAL_PATH_TYPE_PASSAGE_TO_PASSAGE, stage: WorldConstants.CAMP_STAGE_LATE });
            }
            return requiredPaths;
        },
        
        getPathStartingPositions: function (levelVO, options) {
            if (!options.stage)
                return levelVO.sectors;
            if (options.canConnectToDifferentStage)
                return levelVO.sectors;
            var stageSectors = levelVO.getSectorsByStage(options.stage);
            if (stageSectors && stageSectors.length > 0)
                return stageSectors;
            return levelVO.sectors;
        },
        
        getDefaultStage: function (levelVO, sectorPos) {
            var result = null;
            var shortestDist = -1;
            for (var stage in levelVO.stageCenterPositions) {
                var positions = levelVO.stageCenterPositions[stage];
                for (var i = 0; i < positions.length; i++) {
                    var pos = positions[i];
                    var dist = PositionConstants.getDistanceTo(pos, sectorPos);
                    if (shortestDist < 0 || dist < shortestDist) {
                        result = stage;
                        shortestDist = dist;
                    }
                }
            }
            if (shortestDist < 0 || shortestDist > 18) {
                return WorldConstants.CAMP_STAGE_LATE;
            }
            return result;
        },
        
        getDefaultOptions: function (options) {
            options = options || {};
            return { stage: options.stage, criticalPathType: options.criticalPathType, canConnectToDifferentStage: options.canConnectToDifferentStage };
        },

    };
    
    return StructureGenerator;
});