export const YES_NO_NA = ['Yes', 'No', 'N/A'] as const;

export const QUALITY_SCALE = ['Good', 'Fair', 'Poor', 'N/A'] as const;

export const COMPLIANCE_SCALE = ['In compliance', 'Not in compliance', 'N/A'] as const;

export const EROSION_EFFECTIVENESS = ['Effective', 'Partially Effective', 'Not Effective', 'N/A'] as const;

export const WEED_CONTROL_STRATEGIES = [
    'Chemical', 'Mechanical', 'Cultural', 'Biological', 'Integrated', 'Hand Pulling', 'Other',
] as const;

export const RESERVE_PRESETS = [
    'Thunderchild First Nation',
    'Moosomin First Nation',
    "Mosquito Grizzly Bear's Head Lean Man",
    'Sweetgrass First Nation',
    'Little Pine First Nation',
    'Lucky Man First Nation',
    'Poundmaker First Nation',
    'Red Pheasant First Nation',
    'Saulteaux First Nation',
    'Other',
] as const;

export const SITE_TYPE_OPTIONS = [
    'Well Site', 'Access Road', 'Battery', 'Compressor', 'Produced Water Disposal',
    'Pipeline Riser', 'Other',
] as const;

export const COMMODITY_OPTIONS = [
    'Gas', 'Sour Gas', 'Oil', 'Sour Oil', 'Remote Sump', 'Tanks', 'UST',
] as const;

/** @deprecated use COMMODITY_OPTIONS */
export const GAS_FLAG_OPTIONS = COMMODITY_OPTIONS;

export const SITE_STATUS_OPTIONS = [
    'Active', 'Suspended', 'Abandoned', 'Active Reclamation', 'Not Built',
] as const;

export const AUDIT_TYPE_OPTIONS = [
    '1st Year', '2nd Year (Pipeline)', '3 Year', '5 Year', '10 Year (Pipeline)',
] as const;

export function isInCompliance(status: string): boolean {
    if (!status) return false;
    return status.toLowerCase().startsWith('in compliance');
}

export function complianceLabel(status: string): string {
    return isInCompliance(status) ? 'In compliance' : 'Not in compliance';
}
