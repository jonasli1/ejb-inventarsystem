import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';
import type {
  Article,
  Category,
  Location,
  Organization,
  OrganizationUnit,
  PaginatedResult,
  Room,
} from './api-types';

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get<Location[]>('/locations')).data,
    staleTime: 60_000,
  });
}

export function useRooms(locationId?: string) {
  return useQuery({
    queryKey: ['rooms', locationId ?? 'all'],
    queryFn: async () =>
      (await api.get<Room[]>('/rooms', { params: locationId ? { locationId } : undefined })).data,
    staleTime: 60_000,
  });
}

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations', 'all'],
    queryFn: async () =>
      (await api.get<PaginatedResult<Organization>>('/organizations', { params: { pageSize: 100 } }))
        .data.data,
    staleTime: 60_000,
  });
}

export function useOrganizationUnits(organizationId?: string) {
  return useQuery({
    queryKey: ['organization-units', organizationId],
    queryFn: async () =>
      (await api.get<OrganizationUnit[]>(`/organizations/${organizationId}/units`)).data,
    enabled: !!organizationId,
    staleTime: 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/categories')).data,
    staleTime: 60_000,
  });
}

export function useArticles() {
  return useQuery({
    queryKey: ['articles', 'all'],
    queryFn: async () =>
      (await api.get<PaginatedResult<Article>>('/articles', { params: { pageSize: 100 } })).data
        .data,
    staleTime: 30_000,
  });
}
