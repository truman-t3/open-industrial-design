export const appMetadata = {
  displayName: 'Open Industrial Design',
  technicalIdentifier: 'open-industrial-design',
  projectFileExtension: '.oidproj',
} as const;

export {
  resolveAppLocale,
  supportedLocales,
  translate,
  translateDemoLabel,
  translateDesignKind,
  translateDesignStatus,
  translateGraphRelation,
  translateNodeType,
  type AppLocale,
  type MessageKey,
} from './localization';
