import {
  ConfigurationObject,
  extractNonNullParts,
  logModel,
  getParentByName,
  getCodeConfigLockKey,
  validateAndFormatGuid,
  validateConfigObjectKeys,
} from "../../classes/codeConfig";
import { Property, Source } from "../..";
import { Op } from "sequelize";

export async function loadProperty(
  configObject: ConfigurationObject,
  externallyValidate: boolean,
  validate = false
) {
  let isNew = false;
  const source: Source = await getParentByName(Source, configObject.sourceId);

  const guid = await validateAndFormatGuid(Property, configObject.id);
  validateConfigObjectKeys(Property, configObject, ["name"]);

  let property = await Property.scope(null).findOne({
    where: { locked: getCodeConfigLockKey(), guid },
  });
  if (!property) {
    isNew = true;
    property = await Property.create({
      guid,
      locked: getCodeConfigLockKey(),
      key: configObject.key || configObject.name,
      type: configObject.type,
      sourceGuid: source.guid,
    });
  }

  await property.update({
    key: configObject.key || configObject.name,
    unique: configObject.unique,
    isArray: configObject.isArray,
  });

  await property.setOptions(extractNonNullParts(configObject, "options"), null);

  if (configObject.filters) {
    await property.setFilters(configObject.filters, externallyValidate);
  }

  if (configObject.identifying === true) {
    await property.makeIdentifying();
  }

  await property.update({ state: "ready" });

  logModel(property, validate ? "validated" : isNew ? "created" : "updated");

  return property;
}

export async function deleteProperties(guids: string[]) {
  const properties = await Property.scope(null).findAll({
    where: { locked: getCodeConfigLockKey(), guid: { [Op.notIn]: guids } },
  });

  for (const i in properties) {
    const property = properties[i];
    if (property.directlyMapped) continue;
    await property.destroy();
    logModel(property, "deleted");
  }

  return properties.map((instance) => instance.guid);
}