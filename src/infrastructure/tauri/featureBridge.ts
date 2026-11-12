import { invokeTauri, inTauri } from "./runtime";

export interface UserFeature {
  id: number;
  title: string;
  description: string | null;
  feature_type: string;
  geojson: string;
  created_at: string;
  folder_id: string | null;
  color: string;
  image_data: string | null;
}

export const listFeatures = async (): Promise<UserFeature[]> => (inTauri() ? invokeTauri("list_features") : []);

export const addFeature = (
  title: string,
  description: string | null,
  featureType: string,
  geojson: string,
  folderId = "",
  color = "#dc2626",
  imageData: string | null = null,
) => invokeTauri<number>("add_feature", {
  feature: { title, description, featureType, geojson, folderId, color, imageData },
});

export const updateFeature = (
  id: number,
  title: string,
  description: string | null,
  featureType: string,
  geojson: string,
  folderId = "",
  color = "#dc2626",
  imageData: string | null = null,
) => invokeTauri<void>("update_feature", {
  id,
  feature: { title, description, featureType, geojson, folderId, color, imageData },
});

export const deleteFeature = (id: number) => invokeTauri<void>("delete_feature", { id });
