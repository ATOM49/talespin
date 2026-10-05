import { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from './errors';
import {
  LocationFormSchema,
  type Location,
  type LocationForm,
} from '@talespin/schema';

type PrismaLocation = {
  id: string;
  worldId: string;
  name: string;
  gridCellId: string | null;
  coordRel: Prisma.JsonValue;
  props: Prisma.JsonValue | null;
};

const locationSelect = {
  select: {
    id: true,
    worldId: true,
    name: true,
    gridCellId: true,
    coordRel: true,
    props: true,
  },
} as const;

export class LocationService {
  constructor(private prisma: PrismaClient) {}

  async listLocations(worldId: string): Promise<Location[]> {
    const locations = await this.prisma.location.findMany({
      where: { worldId },
      select: locationSelect.select,
    });

    return locations.map((location) =>
      this.mapLocationToDto(location as PrismaLocation),
    );
  }

  async getLocation(id: string): Promise<Location> {
    const location = await this.prisma.location.findUnique({
      where: { id },
      select: locationSelect.select,
    });

    if (!location) {
      throw new ApiError(404, 'Location not found');
    }

    return this.mapLocationToDto(location as PrismaLocation);
  }

  async createLocation(worldId: string, data: LocationForm): Promise<Location> {
    try {
      const validated = LocationFormSchema.parse(data);

      const location = (await this.prisma.location.create({
        data: {
          worldId,
          name: validated.name,
          gridCellId: validated.gridCellId || null,
          coordRel: validated.coordRel as Prisma.InputJsonValue,
          props: (validated.props as Prisma.InputJsonValue) || null,
        },
        select: locationSelect.select,
      })) as PrismaLocation;

      return this.mapLocationToDto(location);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ApiError(409, 'Location with this name already exists');
        }
      }
      throw error;
    }
  }

  async updateLocation(id: string, data: LocationForm): Promise<Location> {
    try {
      const validated = LocationFormSchema.parse(data);

      const location = await this.prisma.location.update({
        where: { id },
        data: {
          name: validated.name,
          gridCellId: validated.gridCellId || null,
          coordRel: validated.coordRel as Prisma.InputJsonValue,
          props: (validated.props as Prisma.InputJsonValue) || null,
        },
        select: locationSelect.select,
      });

      return this.mapLocationToDto(location as PrismaLocation);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new ApiError(404, 'Location not found');
        }
      }
      throw error;
    }
  }

  async deleteLocation(id: string): Promise<void> {
    try {
      await this.prisma.location.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new ApiError(404, 'Location not found');
        }
      }
      throw error;
    }
  }

  private mapLocationToDto(location: PrismaLocation): Location {
    return {
      _id: location.id,
      worldId: location.worldId,
      name: location.name,
      gridCellId: location.gridCellId || undefined,
      coordRel: location.coordRel as Location['coordRel'],
      props: location.props as Location['props'],
    };
  }
}
