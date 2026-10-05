import { FastifyPluginAsync } from 'fastify';
import map from './map.js';
import editImage from './edit-image.js';
import character from './character.js';
import characterGallery from './character-gallery.js';
import faction from './faction.js';
import factionDetails from './faction-details.js';
import worldBlueprint from './world-blueprint.js';
import narrative from './narrative.js';

const generateRoutes: FastifyPluginAsync = async (fastify) => {
  // Register map generation route
  fastify.register(map, { prefix: '/map' });
  // Register image editing route
  fastify.register(editImage, { prefix: '/edit-image' });
  // Character portrait generation
  fastify.register(character, { prefix: '/character' });
  fastify.register(characterGallery, { prefix: '/character-gallery' });
  // Faction image generation
  fastify.register(faction, { prefix: '/faction' });
  // Faction details generation
  fastify.register(factionDetails, { prefix: '/faction-details' });
  // Coherent one-shot world creation proposal
  fastify.register(worldBlueprint, { prefix: '/world-blueprint' });
  fastify.register(narrative, { prefix: '/narrative' });
};

export default generateRoutes;
