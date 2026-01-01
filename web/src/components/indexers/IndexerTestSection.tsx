
import { FlaskConical } from 'lucide-react';
import { Button, Spinner } from '../ui';

interface TestResult {
    success: boolean;
    count: number;
    time_ms: number;
    message: string;
}

interface IndexerTestSectionProps {
    onTest: () => Promise<void>;
    testing: boolean;
    results: TestResult | null;
}

export default function IndexerTestSection({ onTest, testing, results }: IndexerTestSectionProps) {
    return (
        <div className="pt-6 border-t border-neutral-800">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-primary-500" />
                Test Connection
            </h3>

            <Button
                variant="secondary"
                size="sm"
                onClick={onTest}
                disabled={testing}
                className="w-full"
            >
                {testing ? <Spinner size="sm" /> : 'Run Test'}
            </Button>

            {results && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${results.success
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400'
                    }`}>
                    <div className="font-medium">{results.message}</div>
                    {results.time_ms > 0 && (
                        <div className="text-xs mt-1 opacity-75">
                            Response time: {results.time_ms}ms
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
