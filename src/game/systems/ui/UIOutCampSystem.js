define([
    'ash',
    'game/constants/UIConstants',
    'game/constants/UpgradeConstants',
    'game/constants/PlayerActionsHelperConstants',
    'game/constants/OccurrenceConstants',
    'game/constants/CampConstants',
    'game/constants/PerkConstants',
    'game/nodes/level/PlayerLevelNode',
    'game/nodes/PlayerPositionNode',
    'game/nodes/PlayerLocationNode',
    'game/nodes/player/DeityNode',
    'game/nodes/tribe/TribeUpgradesNode',
    'game/components/player/PerksComponent',
    'game/components/common/CampComponent',
    'game/components/sector/ReputationComponent',
    'game/components/sector/improvements/SectorImprovementsComponent',
    'game/components/sector/events/CampEventTimersComponent',
    'game/components/sector/events/TraderComponent',
    'game/components/sector/events/RaidComponent'
], function (
    Ash, UIConstants, UpgradeConstants, PlayerActionsHelperConstants, OccurrenceConstants, CampConstants, PerkConstants,
    PlayerLevelNode, PlayerPositionNode, PlayerLocationNode, DeityNode, TribeUpgradesNode,
    PerksComponent,
    CampComponent, ReputationComponent, SectorImprovementsComponent, CampEventTimersComponent,
    TraderComponent, RaidComponent
) {
    var UIOutCampSystem = Ash.System.extend({
	
        uiFunctions : null,
        gameState : null,
        
        engine: null,
		
		tabChangedSignal: null,
	
        playerPosNodes: null,
        playerLocationNodes: null,
        playerLevelNodes: null,
        deityNodes: null,
        tribeUpgradesNodes: null,
        
        bubbleNumber: 0,
        visibleBuildingCount: 0,
        availableBuildingCount: 0,
        lastShownVisibleBuildingCount: 0,
        lastShownAvailableBuildingCount: 0,
        currentEvents: 0,
        lastShownEvents: 0,
        currentPopulation: 0,
        lastShownPopulation: 0,

        constructor: function (uiFunctions, tabChangedSignal, gameState, levelHelper, upgradesHelper, campHelper, upgradeEffectsHelper) {
            this.uiFunctions = uiFunctions;
			this.tabChangedSignal = tabChangedSignal;
            this.gameState = gameState;
            this.levelHelper = levelHelper;
			this.upgradesHelper = upgradesHelper;
            this.campHelper = campHelper;
            return this;
        },

        addToEngine: function (engine) {
            this.engine  = engine;
            this.playerLocationNodes = engine.getNodeList(PlayerLocationNode);
            this.playerPosNodes = engine.getNodeList(PlayerPositionNode);
            this.playerLevelNodes = engine.getNodeList(PlayerLevelNode);
            this.deityNodes = engine.getNodeList(DeityNode);
            this.tribeUpgradesNodes = engine.getNodeList(TribeUpgradesNode);
        },

        removeFromEngine: function (engine) {
            this.engine = null;
            this.playerLocationNodes = null;
            this.playerPosNodes = null;
            this.playerLevelNodes = null;
            this.deityNodes = null;
            this.tribeUpgradesNodes = null;
        },

        update: function (time) {
            var isActive = this.gameState.uiStatus.currentTab === this.uiFunctions.elementIDs.tabs.in;
            var campCount = this.gameState.numCamps;
            if (!this.playerLocationNodes.head) return;
            if (!this.playerPosNodes.head.position.inCamp) return;
            
            this.updateImprovements(isActive, campCount);
            this.updateWorkers(isActive);
            this.updateEvents(isActive);
            this.updateBubble();
            
            if (!isActive) {
                return;
            }
	    
            var campComponent = this.playerLocationNodes.head.entity.get(CampComponent);
            if (!campComponent) {
                console.log("WARN: Camp UI systen active but no camp found.");
                this.uiFunctions.showTab(this.uiFunctions.elementIDs.tabs.out);
                return;
            }
            
            // Header
            var header = campComponent.getName();
            if (campCount > 1) header += " (" + this.playerPosNodes.head.position.getPosition().getInGameFormat(true) + ")";
            $("#tab-header h2").text(header);
            
            // Vis
            // TODO camp vis
               
            this.updateStats();
        },
        
        updateBubble: function () {
            var buildingNum = this.availableBuildingCount - this.lastShownAvailableBuildingCount + this.visibleBuildingCount - this.lastShownVisibleBuildingCount;
            var eventNum = this.currentEvents - this.lastShownEvents;
            var populationNum = this.currentPopulation - this.lastShownPopulation;
            this.bubbleNumber = buildingNum + eventNum + populationNum;
            $("#switch-in .bubble").text(this.bubbleNumber);
            $("#switch-in .bubble").toggle(this.bubbleNumber > 0);
        },
	
        updateWorkers: function (isActive) {
            var campComponent = this.playerLocationNodes.head.entity.get(CampComponent);
			if (!campComponent) return;
            
            this.currentPopulation = Math.floor(campComponent.population);
            if (isActive) this.lastShownPopulation = this.currentPopulation;
            
            if (!isActive) return;
            
            var improvements = this.playerLocationNodes.head.entity.get(SectorImprovementsComponent);
            
            var showPopulation = campComponent.population > 0 || this.gameState.numCamps > 1;
            $("#in-population").toggle(showPopulation);
            if (!showPopulation) return;
            
            var reputation = this.playerLocationNodes.head.entity.get(ReputationComponent).value;
            var maxPopulation = improvements.getCount(improvementNames.house) * CampConstants.POPULATION_PER_HOUSE;
            maxPopulation += improvements.getCount(improvementNames.house2) * CampConstants.POPULATION_PER_HOUSE2;
            this.updatePopulationChangeDisplay(campComponent, maxPopulation, reputation);
            this.updateAssignedWorkers(campComponent, maxPopulation);
        },
        
        updateWorkerStepper: function (campComponent, id, workerType, maxWorkers, showMax) {
            var freePopulation = campComponent.getFreePopulation();
            var assignedWorkers = campComponent.assignedWorkers[workerType];
            $(id + " input").attr("max", Math.min(assignedWorkers + freePopulation, maxWorkers));
            $(id + " input").val(assignedWorkers);
			$(id).parent().siblings(".in-assign-worker-limit").children(".callout-container").children(".info-callout-target").html(showMax ? "<span>/ " + maxWorkers + "</span>" : "");
        },
        
        updatePopulationChangeDisplay: function (campComponent, maxPopulation, reputation) {
            var freePopulation = campComponent.getFreePopulation();
            var isPopulationMaxed = campComponent.population >= maxPopulation;
            var populationChangePerSec = campComponent.populationChangePerSec;
            var isPopulationStill = isPopulationMaxed && populationChangePerSec !== 0;
            
            var reqRepCur = CampConstants.getRequiredReputation(Math.floor(campComponent.population));
            var reqRepNext = CampConstants.getRequiredReputation(Math.floor(campComponent.population) + 1);
            var isReputationBlocking = reqRepNext < reputation;

            $("#in-population-next").text(campComponent.populationChangePerSec >= 0 ? "Next worker:" : "Worker leaving:");
            $("#in-population-reputation").text("Reputation required: " + reqRepCur + " (current) " + reqRepNext + " (next)");
            $("#in-population h3").text("Population: " + Math.floor(campComponent.population) + " / " + (maxPopulation));
            $("#in-population p#in-population-status").text("Free workers: " + freePopulation);
            
            if (!isPopulationStill) {
                var secondsToChange = 0;
                var progress = 0;
                if (populationChangePerSec > 0) {
                    progress = (campComponent.population - Math.floor(campComponent.population));
                    secondsToChange = (1 - progress) / populationChangePerSec;
                } else if(populationChangePerSec < 0) {
                    progress = (campComponent.population - Math.floor(campComponent.population));
                    secondsToChange = progress / populationChangePerSec;
                } else {
                    progress = 0;
                }
                
                var progressLabel = 
                    populationChangePerSec !== 0 ? UIConstants.getTimeToNum(secondsToChange) : 
                    !isPopulationMaxed && !isReputationBlocking && campComponent.populationCooldownSec > 0 ? "cooldown " + UIConstants.getTimeToNum(campComponent.populationCooldownSec) :
                    "no change";
                
                $("#in-population-bar-next").toggleClass("warning", populationChangePerSec < 0);
                $("#in-population-bar-next").data("progress-percent", progress * 100);
                $("#in-population-bar-next .progress-label").text(progressLabel);
                $("#in-population-bar-next").data("animation-length", 500);
            }
            
            this.uiFunctions.slideToggleIf("#in-population-reputation", null, campComponent.population > 0 && !isPopulationStill, 200, 200);
            this.uiFunctions.slideToggleIf("#in-population-bar-next", null, campComponent.population > 0 && !isPopulationStill, 200, 200);
            this.uiFunctions.slideToggleIf("#in-population-next", null, campComponent.population > 0 && !isPopulationStill, 200, 200);
            this.uiFunctions.slideToggleIf("#in-population-status", null, campComponent.population >= 1, 200, 200);
            this.uiFunctions.slideToggleIf("#in-assign-workers", null, campComponent.population >= 1, 200, 200);
        },
        
        updateAssignedWorkers: function (campComponent, maxPopulation) {    
            var posComponent = this.playerPosNodes.head.position;
            var improvements = this.playerLocationNodes.head.entity.get(SectorImprovementsComponent);
            
            $("#in-assign-weaver").toggle(this.hasUpgrade(this.upgradesHelper.getUpgradeIdForWorker("rope-maker")));
            $("#in-assign-chemist").toggle(this.levelHelper.getLevelClearedWorkshopCount(posComponent.level, resourceNames.fuel) > 0);
            $("#in-assign-apothecary").toggle(this.hasUpgrade(this.upgradesHelper.getUpgradeIdForWorker("apothecary")));
            $("#in-assign-concrete").toggle(this.hasUpgrade(this.upgradesHelper.getUpgradeIdForWorker("concrete")));
            $("#in-assign-smith").toggle(this.hasUpgrade(this.upgradesHelper.getUpgradeIdForWorker("smith")));
            $("#in-assign-soldier").toggle(this.hasUpgrade(this.upgradesHelper.getUpgradeIdForWorker("soldier")));
            
            var workerConsumptionS = "<br/><span class='warning'>water -" + this.campHelper.getWaterConsumptionPerSecond(1) + "/s</span>" +
                "<br/><span class='warning'>food -" + this.campHelper.getFoodConsumptionPerSecond(1) + "/s</span>";
            UIConstants.updateCalloutContent("#in-assign-water .in-assing-worker-desc .info-callout-target", "water +" + this.campHelper.getWaterProductionPerSecond(1, improvements) + "/s" + workerConsumptionS, true);
            UIConstants.updateCalloutContent("#in-assign-scavenger .in-assing-worker-desc .info-callout-target", "metal +" + this.campHelper.getMetalProductionPerSecond(1, improvements) + "/s" + workerConsumptionS, true);
            UIConstants.updateCalloutContent("#in-assign-trapper .in-assing-worker-desc .info-callout-target", "food +" + this.campHelper.getFoodProductionPerSecond(1, improvements) + "/s" + workerConsumptionS, true);
            UIConstants.updateCalloutContent("#in-assign-weaver .in-assing-worker-desc .info-callout-target", "rope +" + this.campHelper.getRopeProductionPerSecond(1, improvements) + "/s" + workerConsumptionS, true);
            UIConstants.updateCalloutContent("#in-assign-chemist .in-assing-worker-desc .info-callout-target", "fuel +" + this.campHelper.getFuelProductionPerSecond(1, improvements) + "/s" + workerConsumptionS, true);
            UIConstants.updateCalloutContent("#in-assign-apothecary .in-assing-worker-desc .info-callout-target", "medicine +" + this.campHelper.getMedicineProductionPerSecond(1, improvements) + "/s" + workerConsumptionS + "<br/><span class='warning'>herbs -" + this.campHelper.getHerbsConsumptionPerSecond(1) + "/s</span>", true);
            UIConstants.updateCalloutContent("#in-assign-concrete .in-assing-worker-desc .info-callout-target", "concrete +" + this.campHelper.getConcreteProductionPerSecond(1, improvements) + "/s" + workerConsumptionS + "<br/><span class='warning'>metal -" + this.campHelper.getMetalConsumptionPerSecondConcrete(1) + "/s</span>", true);
            UIConstants.updateCalloutContent("#in-assign-smith .in-assing-worker-desc .info-callout-target", "tools +" + this.campHelper.getToolsProductionPerSecond(1, improvements) + "/s" + workerConsumptionS + "<br/><span class='warning'>metal -" + this.campHelper.getMetalConsumptionPerSecondSmith(1) + "/s</span>", true);
            UIConstants.updateCalloutContent("#in-assign-soldier .in-assing-worker-desc .info-callout-target", "camp defence +1" + workerConsumptionS, true);
            
            var refineriesOnLevel = this.levelHelper.getLevelClearedWorkshopCount(posComponent.level, resourceNames.fuel);
            var apothecariesInCamp = improvements.getCount(improvementNames.apothecary);
            var cementMillsInCamp = improvements.getCount(improvementNames.cementmill);
            var smithiesInCamp = improvements.getCount(improvementNames.smithy);
            var barracksInCamp = improvements.getCount(improvementNames.barracks);
            
            var maxApothecaries = apothecariesInCamp * CampConstants.getApothecariesPerShop(this.upgradesHelper.getBuildingUpgradeLevel(improvementNames.apothecary, this.tribeUpgradesNodes.head.upgrades));
            var maxConcrete = cementMillsInCamp * CampConstants.getWorkersPerMill(this.upgradesHelper.getBuildingUpgradeLevel(improvementNames.cementmill, this.tribeUpgradesNodes.head.upgrades));
            var maxSmiths = smithiesInCamp * CampConstants.getSmithsPerSmithy(this.upgradesHelper.getBuildingUpgradeLevel(improvementNames.smithy, this.tribeUpgradesNodes.head.upgrades));
            var maxSoldiers = barracksInCamp * CampConstants.getSoldiersPerBarracks(this.upgradesHelper.getBuildingUpgradeLevel(improvementNames.barracks, this.tribeUpgradesNodes.head.upgrades));
            var maxChemists = refineriesOnLevel * CampConstants.CHEMISTS_PER_WORKSHOP;
            this.updateWorkerStepper(campComponent, "#stepper-scavenger", "scavenger", maxPopulation, false);
            this.updateWorkerStepper(campComponent, "#stepper-trapper", "trapper", maxPopulation, false);
            this.updateWorkerStepper(campComponent, "#stepper-water", "water", maxPopulation, false);
            this.updateWorkerStepper(campComponent, "#stepper-rope", "ropemaker", maxPopulation, false);
            this.updateWorkerStepper(campComponent, "#stepper-fuel", "chemist", maxChemists, true);
            this.updateWorkerStepper(campComponent, "#stepper-medicine", "apothecary", maxApothecaries, true);
            this.updateWorkerStepper(campComponent, "#stepper-concrete", "concrete", maxConcrete, true);
            this.updateWorkerStepper(campComponent, "#stepper-smith", "toolsmith", maxSmiths, true);
            this.updateWorkerStepper(campComponent, "#stepper-soldier", "soldier", maxSoldiers, true);
            
            UIConstants.updateCalloutContent("#in-assign-chemist .in-assign-worker-limit .info-callout-target", refineriesOnLevel + " refineries found", true);
            UIConstants.updateCalloutContent("#in-assign-apothecary .in-assign-worker-limit .info-callout-target", apothecariesInCamp + " apothecaries built", true);
            UIConstants.updateCalloutContent("#in-assign-concrete .in-assign-worker-limit .info-callout-target", cementMillsInCamp + " cement mills built", true);
            UIConstants.updateCalloutContent("#in-assign-smith .in-assign-worker-limit .info-callout-target", smithiesInCamp + " smithies built", true);
            UIConstants.updateCalloutContent("#in-assign-soldier .in-assign-worker-limit .info-callout-target", barracksInCamp + " barracks built", true);
        },
        
        updateImprovements: function (isActive, campCount) {
            var improvements = this.playerLocationNodes.head.entity.get(SectorImprovementsComponent);
            var hasTradePost = improvements.getCount(improvementNames.tradepost) > 0;
            var hasDeity = this.deityNodes.head !== null;
            
            var availableBuildingCount = 0;
            var visibleBuildingCount = 0;
            
            var playerActionsHelper = this.uiFunctions.playerActions.playerActionsHelper;
            $.each($("#in-improvements tr"), function () {
                var actionName = $(this).find("button.action-build").attr("action");
                var id = $(this).attr("id");
                if (actionName) {
                    var improvementName = playerActionsHelper.getImprovementNameForAction(actionName);
                    if (improvementName) {
						var requirementCheck = playerActionsHelper.checkRequirements(actionName, false, null);
                        var actionEnabled = requirementCheck.value >= 1;
                        var showActionDisabledReason = false;
                        if (!actionEnabled) {
                            switch (requirementCheck.reason) {
                                case PlayerActionsHelperConstants.DISABLED_REASON_NOT_ENOUGH_LEVEL_POP:
                                    showActionDisabledReason = true;
                            }
                        }
                        var actionAvailable = playerActionsHelper.checkAvailability(actionName, false);
                        var existingImprovements = improvements.getCount(improvementName);
                        if (isActive) {
                            $(this).find(".list-amount").text(existingImprovements);
                            $(this).find(".action-use").toggle(existingImprovements > 0);
                        }
                        
                        var commonVisibilityRule = (actionEnabled || existingImprovements > 0 || showActionDisabledReason);
                        var specialVisibilityRule = true;
                        if (id === "in-improvements-shrine") specialVisibilityRule = hasDeity;
                        if (id === "in-improvements-trading") specialVisibilityRule = campCount > 1;
                        if (id === "in-improvements-research") specialVisibilityRule = campCount > 1;
                        if (id === "in-improvements-market") specialVisibilityRule = hasTradePost;
                        if (id === "in-improvements-inn") specialVisibilityRule = hasTradePost;
                        var isVisible = specialVisibilityRule && commonVisibilityRule;
                        $(this).toggle(isVisible);
                        if (isVisible) visibleBuildingCount++;
                        if (actionAvailable) availableBuildingCount++;
                    }
                }
            });
			
            var perksComponent = this.playerPosNodes.head.entity.get(PerksComponent);
			var hasHospital = improvements.getCount(improvementNames.hospital) > 0;
			var isInjured = perksComponent.getTotalEffect(PerkConstants.perkTypes.injury) !== 1;
			var isAugmented = perksComponent.hasPerk(PerkConstants.perkIds.healthAugment);
			var isAugmentAvailable = this.hasUpgrade(this.upgradesHelper.getUpgradeIdsForImprovement(improvementNames.hospital)[0]);
			$("#btn-use_in_hospital").toggle(hasHospital && (isInjured || isAugmented || !isAugmentAvailable));
			$("#btn-use_in_hospital2").toggle(hasHospital && !isInjured && !isAugmented && isAugmentAvailable);
            
            this.availableBuildingCount = availableBuildingCount;
            if (isActive) this.lastShownAvailableBuildingCount = this.availableBuildingCount;
            this.visibleBuildingCount = visibleBuildingCount;
            if (isActive) this.lastShownVisibleBuildingCount = this.visibleBuildingCount;
        },
    
        updateEvents: function (isActive) {
            var campComponent = this.playerLocationNodes.head.entity.get(CampComponent);
            if (!campComponent) return;
            
            var hasEvents = false;
            var eventTimers = this.playerLocationNodes.head.entity.get(CampEventTimersComponent);
            this.currentEvents = 0;
            
            var showEvents = campComponent.population >= 1 || this.gameState.numCamps > 1;
            $("#in-occurrences").toggle(showEvents);
            
            // Traders
            var hasTrader = this.playerLocationNodes.head.entity.has(TraderComponent);
            if (isActive && showEvents) {
                var isTraderLeaving = hasTrader && eventTimers.getEventTimeLeft(OccurrenceConstants.campOccurrenceTypes.trader) < 5;
                hasEvents = hasEvents || hasTrader;
                $("#in-occurrences-trader").toggle(hasTrader);
                $("#in-occurrences-trader").toggleClass("event-ending", isTraderLeaving);
            }
            
            // Raiders
            var hasRaid = this.playerLocationNodes.head.entity.has(RaidComponent);
            if (isActive && showEvents) {
                $("#in-occurrences-raid").toggle(hasRaid);
                $("#in-occurrences-raid").toggleClass("event-ending", hasRaid);
            }
            
            if (hasRaid) this.currentEvents++;
            if (isActive) this.lastShownEvents = this.currentEvents;
            
            hasEvents = hasEvents || hasRaid;
            $("#in-occurrences-empty").toggle(!hasEvents);
        },
        
        updateStats: function () {
            var campComponent = this.playerLocationNodes.head.entity.get(CampComponent);
			if (!campComponent) return;
			
			var improvements = this.playerLocationNodes.head.entity.get(SectorImprovementsComponent);
			var soldiers = this.playerLocationNodes.head.entity.get(CampComponent).assignedWorkers.soldier;
            var fortificationUpgradeLevel = this.upgradesHelper.getBuildingUpgradeLevel(improvementNames.fortification, this.tribeUpgradesNodes.head.upgrades);
			var raidDanger = Math.round(OccurrenceConstants.getRaidDanger(improvements, soldiers, fortificationUpgradeLevel));
            var raidDefence = OccurrenceConstants.getRaidDefence(improvements, soldiers, fortificationUpgradeLevel);
            
            var inGameFoundingDate = UIConstants.getInGameDate(campComponent.foundedTimeStamp);
            var showCalendar = this.tribeUpgradesNodes.head.upgrades.hasUpgrade(this.upgradesHelper.getUpgradeIdForUIEffect(UpgradeConstants.upgradeUIEffects.calendar));
            $("#in-demographics-general-age .value").text(inGameFoundingDate);
            $("#in-demographics-general-age").toggle(showCalendar);
			
			var showRaid = raidDanger > 0 || raidDefence > 0;
			if (showRaid) {
				$("#in-demographics-raid-danger .value").text(raidDanger + "%");
				$("#in-demographics-raid-defence .value").text(raidDefence);
			}
			$("#in-demographics-raid").toggle(showRaid);
            
            var showLevelStats = this.gameState.numCamps > 1;
            if (showLevelStats) {
                var levelVO = this.playerLevelNodes.head.level.levelVO;
				$("#in-demographics-level-population .value").text(levelVO.populationGrowthFactor * 100 + "%");
            }
            
            $("#id-demographics-level").toggle(showLevelStats);
            
            $("#in-demographics").toggle(showCalendar || showRaid || showLevelStats);
        },
        
        hasUpgrade: function (upgradeId) {
            return this.tribeUpgradesNodes.head.upgrades.hasUpgrade(upgradeId);
        }
        
    });

    return UIOutCampSystem;
});
