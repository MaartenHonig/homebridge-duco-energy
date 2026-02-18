"use strict";
const platform_1 = require("./platform");
module.exports = (api) => {
    api.registerPlatform("homebridge-duco-energy", "DucoEnergy", platform_1.DucoEnergyPlatform);
};
