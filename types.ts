
import React from 'react';

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

// --- IOGC Audit Types ---
export interface IogcAuditData {
    // Title Page Specific
    xTerraFileNumber?: string;
    followUpDate?: string;
    reportDate?: string;
    writtenBy?: string;
    reviewedBy?: string; // "File Review and Report Professional Sign Off"
    coverPhotoUrl?: string;
    titlePageComplianceStatus?: string; // e.g. "LESSEE: Is in compliance"
    titlePageSummary?: string; // The purple highlighted text box

    // Header / Site Info (Shared)
    iogcFileNumber: string;
    legalLocation: string;
    province: string;
    reserveName: string;
    lesseeName: string;
    spudDate: string;
    auditDate: string;
    
    // Checkboxes & Selections
    siteStatus: string[]; // Active, Suspended...
    siteType: string[]; // Well Site...
    products: string[]; // Gas, Oil...
    
    auditType: string; // 1st Year, 5 Year...
    copySentToFirstNation: boolean;

    // Cover Sheet Sections (Checkboxes for "Included")
    reportAddresses: {
        leaseFacilities: boolean;
        vegetation: boolean;
        housekeeping: boolean;
        protection: boolean;
        summary: boolean;
        complianceReview: boolean;
    };
    
    // Attachments checkboxes
    attachments: {
        termsLetter: boolean;
        sketch: boolean;
        photos: boolean;
        followUpLog: boolean;
    };
    
    // Compliance
    complianceStatus: 'In Compliance' | 'Not In Compliance' | '';
    nonComplianceIssues: 'included' | 'N/A' | '';
    recommendations: 'included' | 'N/A' | '';
    complianceDescription: 'included' | 'not included' | 'N/A' | '';

    // Declaration
    declarationName: string;
    declarationDate: string;

    // Sections Content
    // We store questions as a map of QuestionID -> Data
    questions: Record<string, {
        response: string; // Yes, No, N/A, or custom text
        comments: string;
        extraData?: Record<string, string>;
    }>;
}