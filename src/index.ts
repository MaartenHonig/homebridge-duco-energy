import type { API } from "homebridge";
import { DucoEnergyPlatform } from "./platform";

export = (api: API) => {
  api.registerPlatform("homebridge-duco-energy", "DucoEnergy", DucoEnergyPlatform);
};
