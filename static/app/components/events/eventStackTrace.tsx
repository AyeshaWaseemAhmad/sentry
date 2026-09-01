import {Fragment, useMemo, type ComponentType} from 'react';

import {EntryErrorBoundary} from 'sentry/components/events/entryErrorBoundary';
import {Exception} from 'sentry/components/events/interfaces/exception';
import {StackTrace} from 'sentry/components/events/interfaces/stackTrace';
import {Threads} from 'sentry/components/events/interfaces/threads';
import {IssueStackTrace} from 'sentry/components/stackTrace/issueStackTrace';
import type {StackTraceSectionRenderer} from 'sentry/components/stackTrace/types';
import type {Entry, EntryMap, Event} from 'sentry/types/event';
import {EntryType} from 'sentry/types/event';
import type {Group} from 'sentry/types/group';
import type {Project} from 'sentry/types/project';
import {defined} from 'sentry/utils/defined';
import {getConfigForIssueType} from 'sentry/utils/issueTypeConfig';
import {isNativePlatform} from 'sentry/utils/platform';
import {
  getHangProfileData,
  MetricKitHangProfileSection,
} from 'sentry/views/issueDetails/metricKitHangProfileSection';

export function EventStackTrace({
  event,
  group,
  projectSlug,
  children,
  frameActionsComponent,
  collapseAll,
}: {
  event: Event;
  group: Group;
  projectSlug: Project['slug'];
  children?: StackTraceSectionRenderer;
  collapseAll?: boolean;
  frameActionsComponent?: ComponentType<{isHovering: boolean}>;
}) {
  const shouldUseNewStackTrace =
    // New stack trace is currently only non-native platforms.
    !isNativePlatform(event.platform);
  const eventEntries = useMemo(() => {
    return event.entries.reduce<Partial<EntryMap>>((entryMap, entry) => {
      (entryMap as Record<string, Entry>)[entry.type] = entry;
      return entryMap;
    }, {});
  }, [event]);
  const mechanism = event.tags?.find(({key}) => key === 'mechanism')?.value;
  const hangProfileData =
    mechanism === 'mx_hang_diagnostic' ? getHangProfileData(event) : null;
  const groupingCurrentLevel = group?.metadata?.current_level;
  const issueTypeConfig = getConfigForIssueType(group, group.project);

  return hangProfileData ? (
    <MetricKitHangProfileSection data={hangProfileData} />
  ) : (
    <Fragment>
      {defined(eventEntries[EntryType.EXCEPTION]) && (
        <EntryErrorBoundary type={EntryType.EXCEPTION}>
          {shouldUseNewStackTrace ? (
            <IssueStackTrace
              frameActionsComponent={frameActionsComponent}
              collapseAll={collapseAll}
              event={event}
              values={eventEntries[EntryType.EXCEPTION].data.values ?? []}
              projectSlug={projectSlug}
              group={group}
            >
              {children}
            </IssueStackTrace>
          ) : (
            <Exception
              renderSection={children}
              event={event}
              data={eventEntries[EntryType.EXCEPTION].data}
              projectSlug={projectSlug}
              group={group}
              groupingCurrentLevel={groupingCurrentLevel}
            />
          )}
        </EntryErrorBoundary>
      )}
      {issueTypeConfig.stacktrace.enabled &&
        defined(eventEntries[EntryType.STACKTRACE]) && (
          <EntryErrorBoundary type={EntryType.STACKTRACE}>
            {shouldUseNewStackTrace ? (
              <IssueStackTrace
                frameActionsComponent={frameActionsComponent}
                collapseAll={collapseAll}
                event={event}
                stacktrace={eventEntries[EntryType.STACKTRACE].data}
                projectSlug={projectSlug}
                group={group}
              >
                {children}
              </IssueStackTrace>
            ) : (
              <StackTrace
                renderSection={children}
                event={event}
                data={eventEntries[EntryType.STACKTRACE].data}
                projectSlug={projectSlug}
                groupingCurrentLevel={groupingCurrentLevel}
              />
            )}
          </EntryErrorBoundary>
        )}
      {defined(eventEntries[EntryType.THREADS]) && (
        <EntryErrorBoundary type={EntryType.THREADS}>
          <Threads
            renderSection={children}
            event={event}
            data={eventEntries[EntryType.THREADS].data}
            projectSlug={projectSlug}
            groupingCurrentLevel={groupingCurrentLevel}
            group={group}
          />
        </EntryErrorBoundary>
      )}
    </Fragment>
  );
}
