export interface HeaderData {
  proponent: string;
  projectName: string;
  location: string;
  date: string;
  projectNumber: string;
}

export interface DfrHeaderData extends HeaderData {
    monitor: string;
    envFile?: string; // For backward compatibility
    envFileType: string;
    envFileValue: string;
}

export interface DfrTextData {
    projectActivities: string;
    communication: string;
    weatherAndGroundConditions: string;
    environmentalProtection: string;
    wildlifeObservations: string;
    furtherRestoration: string;
}

// --- New DFR Structure Types ---
export interface LocationActivity {
    id: number;
    location: string;
    activities: string;
    comment?: string;
}

export type ActivityBlockType = 'location' | 'general';

// Kept for backward compatibility migration from mixed-type arrays
export interface ActivityBlock {
    id: number;
    type: ActivityBlockType;
    location?: string;
    activities: string;
}

export interface DfrStandardBodyData {
    generalActivity: string;
    locationActivities: LocationActivity[];

    // Old fields for migration logic
    activityBlocks?: ActivityBlock[];
    projectActivities?: string; 

    communication: string;
    weatherAndGroundConditions: string;
    environmentalProtection: string;
    wildlifeObservations: string;
    furtherRestoration: string;
    comments?: { [key: string]: string };
}

export interface PhotoData {
  id: number;
  photoNumber: string;
  date: string;
  location: string;
  description: string;
  imageUrl: string | null;
  imageFile?: File;
  imageId?: string;
  direction?: string;
  isMap?: boolean;
}

// --- SaskPower DFR Types ---
export type ChecklistOption = 'Yes' | 'No' | 'NA' | '';

export interface DfrSaskpowerData {
    proponent: string;
    date: string;
    location: string;
    projectName: string;
    vendorAndForeman: string;
    projectNumber: string; // X-Terra Project Number
    environmentalMonitor: string;
    envFileNumber: string;
    
    generalActivity: string;
    locationActivities: LocationActivity[];

    // Old fields for migration logic
    activityBlocks?: ActivityBlock[];
    projectActivities?: string; 
    locationActivities_old?: LocationActivity[]; // Another legacy format

    totalHoursWorked: string;
    
    completedTailgate: ChecklistOption;
    reviewedTailgate: ChecklistOption;
    reviewedPermits: ChecklistOption;
    
    equipmentOnsite: string;
    weatherAndGroundConditions: string;
    environmentalProtection: string;
    wildlifeObservations: string;
    futureMonitoring: string;
    comments?: { [key: string]: string };
}