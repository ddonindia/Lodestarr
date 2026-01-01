import { Download, Check } from 'lucide-react';
import { Card, CardBody, Button, Badge, Spinner } from '../ui';
import type { GithubIndexer } from '../../types/indexer';

interface BrowseIndexersGridProps {
    indexers: GithubIndexer[];
    downloading: Set<string>;
    onDownload: (name: string) => void;
}

export default function BrowseIndexersGrid({
    indexers,
    downloading,
    onDownload
}: BrowseIndexersGridProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {indexers.map((indexer) => (
                <Card key={indexer.name} hover className="h-full">
                    <CardBody className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-neutral-900 dark:text-white truncate">
                                {indexer.name}
                            </h3>
                        </div>
                        <div className="flex-shrink-0 ml-2">
                            {indexer.installed ? (
                                <Badge variant="success" size="sm">
                                    <Check className="w-3 h-3 mr-1" />
                                    Installed
                                </Badge>
                            ) : (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => onDownload(indexer.name)}
                                    disabled={downloading.has(indexer.name)}
                                >
                                    {downloading.has(indexer.name) ? (
                                        <Spinner size="sm" />
                                    ) : (
                                        <Download className="w-4 h-4" />
                                    )}
                                </Button>
                            )}
                        </div>
                    </CardBody>
                </Card>
            ))}
        </div>
    );
}
