import styled from '@emotion/styled';
import {keepPreviousData, useQuery} from '@tanstack/react-query';

import {Tag} from '@sentry/scraps/badge';
import {CompactSelect} from '@sentry/scraps/compactSelect';
import {Container, Flex, Stack} from '@sentry/scraps/layout';
import {OverlayTrigger} from '@sentry/scraps/overlayTrigger';
import {Pagination} from '@sentry/scraps/pagination';
import type {TableColumnConfig} from '@sentry/scraps/table';
import {Text} from '@sentry/scraps/text';
import {Tooltip} from '@sentry/scraps/tooltip';

import Feature from 'sentry/components/acl/feature';
import {SearchBar} from 'sentry/components/searchBar';
import {SentryDocumentTitle} from 'sentry/components/sentryDocumentTitle';
import {SimpleTable} from 'sentry/components/tables/simpleTable';
import type {SortDirection} from 'sentry/components/tables/sortableHeaderCell';
import {IconSentry} from 'sentry/icons';
import {t, tct} from 'sentry/locale';
import {apiOptions, selectJsonWithHeaders} from 'sentry/utils/api/apiOptions';
import {parseCursor} from 'sentry/utils/cursor';
import {FieldValueType} from 'sentry/utils/fields';
import {MarkedText} from 'sentry/utils/marked/markedText';
import {decodeScalar} from 'sentry/utils/queryString';
import {useLocation} from 'sentry/utils/useLocation';
import {useNavigate} from 'sentry/utils/useNavigate';
import {useOrganization} from 'sentry/utils/useOrganization';
import {TypeBadge} from 'sentry/views/explore/components/typeBadge';
import {SettingsPageHeader} from 'sentry/views/settings/components/settingsPageHeader';
import {useProjectSettingsOutlet} from 'sentry/views/settings/project/projectSettingsLayout';

type AttributeDataset = 'spans' | 'logs' | 'tracemetrics';

interface Attribute {
  attributeSource: {source_type: 'sentry' | 'user'};
  attributeType: 'string' | 'number' | 'boolean' | 'array';
  datasets: AttributeDataset[];
  name: string;
  context?: {
    brief?: string;
    isDeprecated?: boolean;
  };
}

const DATASET_LABELS: Record<AttributeDataset, string> = {
  spans: t('Spans'),
  logs: t('Logs'),
  tracemetrics: t('Metrics'),
};

const ALL_OPTION_VALUE = 'all';

const DATASET_OPTIONS = [
  {value: ALL_OPTION_VALUE, label: t('All')},
  {value: 'spans', label: DATASET_LABELS.spans},
  {value: 'logs', label: DATASET_LABELS.logs},
  {value: 'tracemetrics', label: DATASET_LABELS.tracemetrics},
];

const ATTRIBUTE_VALUE_TYPES: Record<Attribute['attributeType'], FieldValueType> = {
  string: FieldValueType.STRING,
  number: FieldValueType.NUMBER,
  boolean: FieldValueType.BOOLEAN,
  array: FieldValueType.ARRAY,
};

const ATTRIBUTES_PER_PAGE = 25;
const ATTRIBUTES_STATS_PERIOD = '14d';

const SORT_FIELDS = ['name', 'type', 'datasets', 'description'] as const;

type SortField = (typeof SORT_FIELDS)[number];

interface Sort {
  direction: SortDirection;
  field: SortField;
}

const DEFAULT_SORT: Sort = {field: 'name', direction: 'asc'};

const COLUMNS: TableColumnConfig[] = [
  {key: 'name', width: 'minmax(200px, 2fr)'},
  {key: 'type', width: 'max-content'},
  {key: 'datasets', width: 'max-content'},
  {key: 'description', width: 'minmax(200px, 3fr)'},
];

function decodeSort(value: string | undefined): Sort {
  const direction = value?.startsWith('-') ? 'desc' : 'asc';
  const field = SORT_FIELDS.find(sortField => sortField === value?.replace(/^-/, ''));
  return field ? {field, direction} : DEFAULT_SORT;
}

function encodeSort({field, direction}: Sort) {
  return direction === 'desc' ? `-${field}` : field;
}

function decodeOption(value: string | undefined, options: Array<{value: string}>) {
  return options.find(option => option.value === value)?.value ?? ALL_OPTION_VALUE;
}

function ProjectAttributesSettings() {
  const organization = useOrganization();
  const {project} = useProjectSettingsOutlet();
  const location = useLocation();
  const navigate = useNavigate();

  const typeOptions = [
    {value: ALL_OPTION_VALUE, label: t('All')},
    ...Object.keys(ATTRIBUTE_VALUE_TYPES)
      .filter(
        type =>
          type !== 'array' ||
          organization.features.includes('trace-item-array-query-support')
      )
      .map(type => ({value: type, label: type})),
  ];

  const cursor = decodeScalar(location.query.cursor);
  const sort = decodeSort(decodeScalar(location.query.sort));
  const dataset = decodeOption(decodeScalar(location.query.dataset), DATASET_OPTIONS);
  const type = decodeOption(decodeScalar(location.query.type), typeOptions);
  const search = decodeScalar(location.query.search, '');

  function updateQuery(query: Record<string, string | undefined>) {
    navigate({
      ...location,
      query: {...location.query, cursor: undefined, ...query},
    });
  }

  const {data, isPending, isError, refetch} = useQuery({
    ...apiOptions.as<Attribute[]>()(
      '/organizations/$organizationIdOrSlug/trace-items/attributes/merged/',
      {
        path: {organizationIdOrSlug: organization.slug},
        query: {
          attributeType: type === ALL_OPTION_VALUE ? undefined : type,
          cursor,
          dataset: dataset === ALL_OPTION_VALUE ? undefined : dataset,
          expand: 'context',
          search: search || undefined,
          per_page: ATTRIBUTES_PER_PAGE,
          project: [project.id],
          sort: encodeSort(sort),
          statsPeriod: ATTRIBUTES_STATS_PERIOD,
        },
        staleTime: 0,
      }
    ),
    select: selectJsonWithHeaders,
    placeholderData: keepPreviousData,
  });

  const attributes = data?.json;
  const totalHits = Number(data?.headers['X-Hits'] ?? 0);
  const totalPages = Math.ceil(totalHits / ATTRIBUTES_PER_PAGE);
  const currentPage =
    Math.floor((parseCursor(cursor)?.offset ?? 0) / ATTRIBUTES_PER_PAGE) + 1;

  return (
    <SentryDocumentTitle title={t('Attributes')} projectSlug={project.slug}>
      <SettingsPageHeader
        title={t('Attributes')}
        subtitle={t(
          'Browse the attributes sent with your spans, logs, and metrics in the last 14 days.'
        )}
      />
      <Stack gap="md">
        <Flex gap="md" wrap="wrap">
          <CompactSelect
            trigger={triggerProps => (
              <OverlayTrigger.Button {...triggerProps} prefix={t('Dataset')} />
            )}
            value={dataset}
            options={DATASET_OPTIONS}
            onChange={option =>
              updateQuery({
                dataset: option.value === ALL_OPTION_VALUE ? undefined : option.value,
              })
            }
          />
          <CompactSelect
            trigger={triggerProps => (
              <OverlayTrigger.Button {...triggerProps} prefix={t('Type')} />
            )}
            value={type}
            options={typeOptions}
            onChange={option =>
              updateQuery({
                type: option.value === ALL_OPTION_VALUE ? undefined : option.value,
              })
            }
          />
          <Container flexGrow={1}>
            <SearchBar
              query={search}
              placeholder={t('Search attribute names or descriptions')}
              onSearch={query => updateQuery({search: query || undefined})}
            />
          </Container>
        </Flex>
        <SimpleTable
          columns={COLUMNS}
          header={
            <SimpleTable.HeaderRow>
              <SortableHeaderCell field="name" sort={sort}>
                {t('Name')}
              </SortableHeaderCell>
              <SortableHeaderCell field="type" sort={sort}>
                {t('Type')}
              </SortableHeaderCell>
              <SortableHeaderCell field="datasets" sort={sort}>
                {t('Datasets')}
              </SortableHeaderCell>
              <SortableHeaderCell field="description" sort={sort}>
                {t('Description')}
              </SortableHeaderCell>
            </SimpleTable.HeaderRow>
          }
        >
          {isPending && <SimpleTable.Loading />}
          {isError && <SimpleTable.Error onRetry={refetch} />}
          {attributes?.length === 0 && (
            <SimpleTable.Empty>{t('No attributes found')}</SimpleTable.Empty>
          )}
          {attributes?.map(attribute => (
            <AttributeRow
              key={`${attribute.name}:${attribute.attributeType}:${attribute.attributeSource.source_type}`}
              attribute={attribute}
            />
          ))}
        </SimpleTable>
        <Stack align="end" gap="sm" paddingTop="md">
          {totalPages > 0 && (
            <Text variant="muted" size="sm">
              {tct('Page [currentPage] of [totalPages]', {
                currentPage,
                totalPages,
              })}
            </Text>
          )}
          <PaginationNoMargin pageLinks={data?.headers.Link} />
        </Stack>
      </Stack>
    </SentryDocumentTitle>
  );
}

function SortableHeaderCell({
  children,
  field,
  sort,
}: {
  children: React.ReactNode;
  field: SortField;
  sort: Sort;
}) {
  const location = useLocation();
  const isActive = sort.field === field;
  const nextSort: Sort = {
    field,
    direction: isActive && sort.direction === 'asc' ? 'desc' : 'asc',
  };

  return (
    <SimpleTable.HeaderCell
      sort={isActive ? sort.direction : undefined}
      to={{
        ...location,
        query: {
          ...location.query,
          cursor: undefined,
          sort: encodeSort(nextSort),
        },
      }}
    >
      {children}
    </SimpleTable.HeaderCell>
  );
}

function AttributeRow({attribute}: {attribute: Attribute}) {
  const {context} = attribute;

  return (
    <SimpleTable.Row>
      <SimpleTable.RowCell>
        <Flex align="center" gap="sm" wrap="wrap">
          <Text monospace wordBreak="break-all">
            {attribute.name}
          </Text>
          {attribute.attributeSource.source_type === 'sentry' && (
            <Tooltip title={t('Added by Sentry')} skipWrapper>
              <IconSentry size="xs" aria-label={t('Added by Sentry')} />
            </Tooltip>
          )}
          {context?.isDeprecated && <Tag variant="warning">{t('Deprecated')}</Tag>}
        </Flex>
      </SimpleTable.RowCell>
      <SimpleTable.RowCell>
        <TypeBadge valueType={ATTRIBUTE_VALUE_TYPES[attribute.attributeType]} />
      </SimpleTable.RowCell>
      <SimpleTable.RowCell>
        <Flex gap="xs" wrap="wrap">
          {attribute.datasets.map(dataset => (
            <Tag key={dataset} variant="muted">
              {DATASET_LABELS[dataset]}
            </Tag>
          ))}
        </Flex>
      </SimpleTable.RowCell>
      <SimpleTable.RowCell>
        {context?.brief ? (
          <Text>
            <MarkedText as="span" inline text={context.brief} />
          </Text>
        ) : (
          <Text variant="muted">—</Text>
        )}
      </SimpleTable.RowCell>
    </SimpleTable.Row>
  );
}

export default function ProjectAttributes() {
  return (
    <Feature features="attribute-management">
      <ProjectAttributesSettings />
    </Feature>
  );
}

const PaginationNoMargin = styled(Pagination)`
  margin: 0;
`;
