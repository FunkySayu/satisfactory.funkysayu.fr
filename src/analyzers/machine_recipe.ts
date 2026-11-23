// Production machines that have no recipe selected: they make nothing, so every belt and pipe around them stays empty.
import { cls, ref } from '../model/satisfactory_save';
import type { Analyzer, Issue } from './types';
import { makeIssue, viewsFor } from './issue';

/** Buildings that only run once a recipe is picked. */
const PRODUCTION = /^Build_(SmelterMk1|FoundryMk1|ConstructorMk1|AssemblerMk1|ManufacturerMk1|OilRefinery|Blender|Packager|HadronCollider|Converter|QuantumEncoder)_C$/;

export const MACHINE_RECIPE_ANALYZER: Analyzer = {
  id: 'machine-recipe',
  name: 'Machine recipe',
  description: 'Every production machine has a recipe selected.',
  targets: ['save', 'blueprint'],
  checks: {
    'machine.norecipe': {
      title: 'No recipe',
      why: 'This machine has no recipe selected, so it makes nothing and takes nothing: its belts and pipes stay empty, and the lines it should feed fall short.',
      fix: 'Open the machine and pick its recipe. In a blueprint, set it in the Blueprint Designer, then save the blueprint again.',
    },
  },
  run(save) {
    const out: Issue[] = [];
    const isBp = save.kind === 'blueprint';
    for (const o of save.index.objects) {
      if (o.virtual || !PRODUCTION.test(cls(o)) || ref(o, 'mCurrentRecipe')) continue;
      // a blueprint is meant to be placed ready to run: a machine left without recipe is a mistake. In a save it is
      // more often a spare or a machine being set up, so it is only a warning there.
      out.push(makeIssue(save, isBp ? 'error' : 'warn', 'build', 'machine.norecipe', `${save.names.building(o)} has no recipe selected`, o,
        { kv: save.buildings.details(o), views: viewsFor(save, [o.instanceName]) }));
    }
    return out;
  },
};
