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
    highlights?: {
        activities?: TextHighlight[];
    };
    inlineComments?: {
        activities?: TextComment[];
    };
}

export type ActivityBlockType = 'location' | 'general';

// Kept for backward compatibility migration from mixed-type arrays
export interface ActivityBlock {
    id: number;
    type: ActivityBlockType;
    location?: string;
    activities: string;
}

export interface TextHighlight {
    start: number;
    end: number;
    color: string; // hex color code e.g., '#FFFF00'
}

/**
 * Comment Reply - CRITICAL: author MUST be preserved on save/load
 * Only use getCurrentUsername() for NEW replies, never overwrite stored author
 */
export interface CommentReply {
    id: string;
    text: string;
    author: string;        // PRESERVED: Never overwrite on load
    authorAvatar?: string; // Base64 data URL, embedded at creation time
    timestamp: Date;       // Serialized as ISO string in JSON
}

/**
 * Text Comment (anchored to specific text range)
 * CRITICAL: author MUST be preserved on save/load
 * Only use getCurrentUsername() for NEW comments, never overwrite stored author
 */
export interface TextComment {
    id: string;
    start: number;         // Character index in text
    end: number;           // Character index in text
    text: string;          // Comment body
    suggestedText?: string; // Optional text suggestion
    author: string;        // PRESERVED: Never overwrite on load
    authorAvatar?: string; // Base64 data URL, embedded at creation time
    timestamp: Date;       // Serialized as ISO string in JSON
    resolved: boolean;
    replies?: CommentReply[];
}

/**
 * Comment Thread - Alternative structure for field-level comments
 * Can be used for simpler comment systems not anchored to text ranges
 */
export interface CommentThread {
    id: string;
    anchorId: string;      // Field ID this comment is attached to
    author: string;        // PRESERVED: Never overwrite on load
    createdAt: number;     // Unix timestamp
    body: string;
    resolved?: boolean;
    replies: CommentReply[];
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
    
    // Highlights (not exported to PDF)
    highlights?: {
        generalActivity?: TextHighlight[];
        communication?: TextHighlight[];
        weatherAndGroundConditions?: TextHighlight[];
        environmentalProtection?: TextHighlight[];
        wildlifeObservations?: TextHighlight[];
        furtherRestoration?: TextHighlight[];
    };

    // Inline comments (not exported to PDF)
    inlineComments?: {
        generalActivity?: TextComment[];
        communication?: TextComment[];
        weatherAndGroundConditions?: TextComment[];
        environmentalProtection?: TextComment[];
        wildlifeObservations?: TextComment[];
        furtherRestoration?: TextComment[];
    };
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
  inlineComments?: TextComment[];
  highlights?: TextHighlight[];
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
    
    // Highlights (not exported to PDF)
    highlights?: {
        generalActivity?: TextHighlight[];
        equipmentOnsite?: TextHighlight[];
        weatherAndGroundConditions?: TextHighlight[];
        environmentalProtection?: TextHighlight[];
        wildlifeObservations?: TextHighlight[];
        futureMonitoring?: TextHighlight[];
    };

    // Inline comments (not exported to PDF)
    inlineComments?: {
        generalActivity?: TextComment[];
        equipmentOnsite?: TextComment[];
        weatherAndGroundConditions?: TextComment[];
        environmentalProtection?: TextComment[];
        wildlifeObservations?: TextComment[];
        futureMonitoring?: TextComment[];
    };
}

// ─── IOGC Lease Audit Types ───────────────────────────────────────────────────

export type YesNo             = 'Yes' | 'No' | '';
export type YesNoNA           = 'Yes' | 'No' | 'NA' | '';
export type IncludedOption    = 'Included' | 'Not Included' | 'NA' | '';
export type ComplianceOption  = 'Compliant' | 'Non-Compliant' | 'NA' | '';
export type ConditionRating   = 'Good' | 'Fair' | 'Poor' | '';
export type ConditionRatingNA = 'Good' | 'Fair' | 'Poor' | 'NA' | '';
export type SiteStatus        = 'Active' | 'Suspended' | 'Abandoned' | 'Active Reclamation' | 'Not Built' | '';
export type AuditType         = '1st Year' | '2nd Year (Pipeline)' | '3 Year' | '5 Year' | '10 Year (Pipeline)' | '';
export type ConstructionMethod= 'Single lift' | 'Two-lift' | 'Minimal Disturbance' | 'Other' | '';

export interface IogcCoverData {
    iogcFileNumber: string; legalLocation: string; province: string; reserveNameNumber: string;
    reserveNamePreset?: string; // '__custom__' | preset value | '' — tracks reserve selector state
    lesseeName: string; wellSpudDate: string; siteStatus: string; siteTypes: string[];
    gasFlags: string[]; auditDate: string; auditType: string;
    copySentToFirstNation: string; reportAddressesFacilities: string; reportAddressesVegetation: string;
    reportAddressesHousekeeping: string; reportAddressesProtection: string; reportAddressesSummary: string;
    reportAddressesTermsReview: string; attachTermsLetter: string; attachSiteSketch: string;
    attachSitePhotos: string; attachFollowUp: string; complianceStatus: string; // auto-synced from sectionE.q46OverallCompliance
    nonComplianceSummaryIncluded: string; recommendationsIncluded: string; complianceDescriptionIncluded: string;
    declarationName: string; declarationDesignation: string; declarationDate: string;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
}

export interface IogcSectionA {
    q1EnvMonitorRequired: string; q1MonitorName: string; q1MonitorCompany: string;
    q1StartConstructionDate: string; q1ConstructionMethod: string; q1ConstructionMethodOther: string;
    q1SoilHandling: string; q1SoilHandlingExplain: string; q1SpudDate: string; q1Setbacks: string;
    q1FederalDept: string; q1Comments: string;
    q2FnLiaison: string; q2LiaisonName: string; q2CulturalSites: string; q2Comments: string;
    q3WildlifeSurvey: string; q3Comments: string; q4AdditionalMitigation: string; q4Comments: string;
    q5FenceAlterations: string; q5Comments: string; q6WaterWellTesting: string;
    q6ResultsIncluded: string; q6Comments: string;
    q7WasteLocation: string; q7ReserveLocation: string; q7ComplianceWithRegs: string;
    q7MudType: string; q7SumpType: string; q7DisposalMethods: string[]; q7RemoteSumpOS: string; q7Comments: string;
    q8LandsprayOnReserve: string; q8ReportAttached: string; q8MeetsCriteria: string;
    q9TimberMethods: string[]; q9FnNotification: string;
    q10ProgressiveReclamation: string; q10SlopesContoured: string; q10SoilsRespread: string;
    q10VegetationMethod: string; q10CertifiedSeed: string; q10VegetationEstablishment: string; q10Comments: string;
    q11ConstructionCleanup: string; q11Comments: string;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
}

export interface IogcSectionB {
    q12WeedList: string; q12Comments: string; q13VegetationStatus: string;
    q13StressedVegetation: string; q13BareSpots: string; q13Comments: string;
    q14WeedMonitoringPlan: string;
    q14WeedControlOptions: string[]; // multi-select from WEED_CONTROL_STRATEGIES
    q14WeedControlStrategies: string; // free-text notes / "Other" explanation
    q14OngoingInspections: string;
    q14CompliantWithRegs: string; q14Comments: string;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
}

export interface IogcSectionC {
    q15Activity: string; q15Comments: string; q16Landuse: string; q16AccessRoadConditions: string; q16Comments: string;
    q17LowSpotsSlumping: string; q17Rutting: string; q17LeaseAccessibility: string; q17Comments: string;
    q18Traffic: string; q18Comments: string; q19LeaseBermCondition: string; q19Comments: string;
    q20FlareStack: string; q20Comments: string; q21OdourDetection: string; q21Comments: string;
    q22UnusedEquipmentRemoved: string; q22FelledTreesRemoved: string; q22Comments: string;
    q23GarbageDebris: string; q23Comments: string; q24ReportedComplaints: string;
    q24Investigated: string; q24Comments: string;
    q25Drainage: string; q25Ponding: string; q25AquaticVegetation: string; q25Comments: string;
    q26PumpOff: string; q26Frequency: string; q26Erosion: string; q26Comments: string;
    q27ErosionControl: string; q27Comments: string; q28Waterbodies: string; q28Distance: string;
    q28Area: string; q28Buffer: string; q28Mitigation: string; q28Comments: string;
    q29PermitsAuthorization: string; q29OngoingPermits: string; q29Comments: string;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
}

export interface IogcSectionD {
    q30Signage: string; q30Visible: string; q30Legible: string; q30Hotline: string; q30Comments: string;
    q31Fencing: string; q31HumanRestriction: string; q31LivestockRestriction: string;
    q31Maintained: string; q31TexasGateCondition: string; q31Comments: string;
    q32Culverts: string; q32ProperlyInstalled: string; q32CorrectSize: string;
    q32ProperlyMaintained: string; q32Comments: string;
    q33SurfaceCasingVent: string; q33OpenClosed: string; q33Clearance: string; q33Comments: string;
    q34WellheadValves: string; q34BullPlugs: string; q34Comments: string;
    q35ChemicalStorage: string; q35Sealed: string; q35Whmis: string; q35Msds: string; q35Comments: string;
    q36Tanks: string; q36InGoodRepair: string; q36Comments: string;
    q37ReportableSpills: string; q37SpillDate: string; q37Substance: string;
    q37Volume: string; q37Notified: string; q37Comments: string;
    q38SurfaceStaining: string; q38OnSite: string; q38OffSite: string; q38Comments: string;
    q39Erp: string; q39ErpInPlace: string; q39Comments: string;
    q40ErpExercise: string; q40Date: string; q40Comments: string;
    q41ExcavationHazards: string; q41Comments: string;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
}

export interface IogcSectionE {
    q42IogcTerms: string; q42Comments: string; q43OtherRegulations: string; q43Comments: string;
    q44SummaryNonCompliance: string; q45NonComplianceFollowUp: string;
    q46OverallCompliance: string; q46Comments: string;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
}

export interface IogcAttachment {
    included: boolean;
    fileName?: string;
    fileData?: string; // base64-encoded PDF bytes
}

export interface IogcSectionF {
    termsLetter: IogcAttachment;
    siteSketch: IogcAttachment;
    sitePhotos: IogcAttachment;
    followUpReport: IogcAttachment;
}

export interface IogcLeaseAuditData {
    projectNumber: string; surfaceLeaseOS: string; proponent: string;
    projectName: string; location: string; date: string;
    reportWrittenBy: string; professionalSignOff: string; followUpDate: string; reportDate: string;
    cover: IogcCoverData;
    sectionA: IogcSectionA;
    sectionB: IogcSectionB;
    sectionC: IogcSectionC;
    sectionD: IogcSectionD;
    sectionE: IogcSectionE;
    sectionF?: IogcSectionF;
}