define([
    'jquery/jquery-1.11.1.min',
    'core/ConsoleLogger',
    'lzstring/lz-string',
    'game/helpers/SaveHelper',
    'game/constants/UpgradeConstants'
], function (jQuery, ConsoleLogger, LZString, SaveHelper, UpgradeConstants) {
    
    'use strict';
    
    function registerButtonListeners() {
        $("#fix-evidence-knife-compass").click(function () { fixEvidenceKnifeCompass(); });
    }
    
    function showMessage(str) {
        alert(str)
    }
        
    function loadSave() {
        log.i("loading save..")
        var compressed = $("#save-input").val();
        if (!compressed) {
            return null;
        }
        var saveHelper = new SaveHelper();
        var json = LZString.decompressFromBase64(compressed);
        log.i("loaded save version: " + json.version)
        var object = saveHelper.parseSaveJSON(json);
        return object;
    }
    
    function exportSave(object) {
        let json = JSON.stringify(object);
        let compressed = LZString.compressToBase64(json);
        $("#save-output").val(compressed);
    }
    
    function validateSave(save) {
        if (!save) return false;
        if (!save.entitiesObject) return false;
        if (!save.gameState) return false;
        if (!save.version) return false;
        return true;
    }
    
    function checkSave(save, checks) {
        let result = { ok: true, reason: "" };
        
        log.i("checking save..");
        for (var i = 0; i < checks.length; i++) {
            let checkResult = checks[i](save);
            log.i("check " + i + " " + checkResult.ok + " " + checkResult.reason);
            if (!checkResult.ok) {
                result.ok = false;
                result.reason = checkResult.reason;
                break;
            }
        }
        
        return result;
    }
    
    function checkSaveHasUpgrade(save, upgradeID, requiredValue) {
        let result = { ok: true, reason: "" };
        let upgradeName = UpgradeConstants.upgradeDefinitions[upgradeID].name;
        let hasUpgrade = save.entitiesObject.tribe.Upgrades.boughtUpgrades.indexOf(upgradeID) >= 0;
        result.ok = hasUpgrade == requiredValue;
        result.reason = "Upgrade " + upgradeName + " " + (hasUpgrade ? "already unlocked" : "not unlocked");
        return result;
    }
    
    function fixSave(save, fixes) {
        let result = JSON.parse(JSON.stringify(save));
        log.i("applying fix..");
        for (var i = 0; i < fixes.length; i++) {
            log.i("applying fix " + (i+1) + "/" + fixes.length);
            fixes[i](result);
        }
        log.i("fix done");
        return result;
    }
    
    function fixSaveRemoveUpgrade(save, upgradeID) {
        let boughtUpgrades = save.entitiesObject.tribe.Upgrades.boughtUpgrades;
        let index = boughtUpgrades.indexOf(upgradeID);
        boughtUpgrades.splice(index, 1);
        
        if (UpgradeConstants.piecesByBlueprint[upgradeID]) {
            let blueprint = { upgradeId: upgradeID, maxPieces: UpgradeConstants.piecesByBlueprint[upgradeID], currentPieces: UpgradeConstants.piecesByBlueprint[upgradeID] };
            save.entitiesObject.tribe.Upgrades.availableBlueprints.push(blueprint);
        }
    }
    
    function fixSaveGrantEvidence(save, amount) {
        let currentValue = save.entitiesObject.player.Evidence.value || 0;
        let newValue = currentValue + amount;
        save.entitiesObject.player.Evidence.value = newValue;
    }
    
    function fixSaveGrantRumours(save, amount) {
        let currentValue = save.entitiesObject.player.Rumours.value || 0;
        let newValue = currentValue + amount;
        save.entitiesObject.player.Rumours.value = newValue;
    }
    
    function fixEvidenceKnifeCompass() {
        let save = loadSave();
        let isSaveValid = validateSave(save);
        if (!isSaveValid) {
            showMessage("Input is not a valid save.");
            return;
        }
        
        let checkResult = checkSave(save, [
            function (save) { return checkSaveHasUpgrade(save, "unlock_building_tradingpost", false); },
            function (save) { return checkSaveHasUpgrade(save, "unlock_weapon_15", true); },
        ]);
        
        if (!checkResult.ok) {
            showMessage("This save is not valid for this fix. Reason: " + checkResult.reason);
            return;
        }
        
        // cost in 0.3.1
        let evidenceCost = 80;
        let rumourCost = 58;
        
        let result = fixSave(save, [
            function (save) { fixSaveRemoveUpgrade(save, "unlock_weapon_15") },
            function (save) { fixSaveGrantEvidence(save, evidenceCost) },
            function (save) { fixSaveGrantRumours(save, 58) },
        ]);
        log.i(save);
        log.i(result);
        exportSave(result);
        showMessage("Fix applied. Removed upgrade 'Knife' and reinbursed " + evidenceCost + " Evidence and " + rumourCost + " Rumours. Copy new save from the Output box.");
    }
    
    registerButtonListeners();
    
});