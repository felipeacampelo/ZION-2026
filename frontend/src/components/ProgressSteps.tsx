import { Check } from 'lucide-react';

interface Step {
  number: number;
  title: string;
  description: string;
}

interface ProgressStepsProps {
  currentStep: number;
  steps: Step[];
}

export default function ProgressSteps({ currentStep, steps }: ProgressStepsProps) {
  const completedColor = '#1a2e1a';
  const activeColor = '#c9a84c';

  return (
    <div className="w-full py-8">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            {/* Step Circle */}
            <div className="flex flex-col items-center relative">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg transition-all duration-300"
                style={{
                  backgroundColor: step.number < currentStep 
                    ? completedColor
                    : step.number === currentStep 
                    ? activeColor
                    : '#e5e7eb',
                  color: step.number < currentStep 
                    ? '#ffffff'
                    : step.number === currentStep 
                    ? '#1a2e1a'
                    : '#6b7280',
                  boxShadow: step.number === currentStep ? '0 0 0 4px rgba(201, 168, 76, 0.18)' : 'none'
                }}
              >
                {step.number < currentStep ? (
                  <Check className="w-6 h-6" />
                ) : (
                  step.number
                )}
              </div>
              
              {/* Step Info */}
              <div className="mt-3 text-center">
                <div
                  className="text-sm font-semibold"
                  style={{ color: step.number === currentStep ? activeColor : '#374151' }}
                >
                  {step.title}
                </div>
                <div className="text-xs text-gray-500 mt-1 hidden sm:block">
                  {step.description}
                </div>
              </div>
            </div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div className="flex-1 h-1 mx-4 -mt-12">
                <div
                  className="h-full transition-all duration-300"
                  style={{ backgroundColor: step.number < currentStep ? completedColor : '#e5e7eb' }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
