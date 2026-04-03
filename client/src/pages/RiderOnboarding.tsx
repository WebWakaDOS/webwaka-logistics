/**
 * RiderOnboarding.tsx — T-LOG-05
 * Multi-step gig rider onboarding form with KYC document upload.
 *
 * NDPR compliance:
 *  - Driver's license number is NEVER collected. Only the document image is uploaded.
 *  - BVN is never requested.
 *  - All uploads go directly to R2 via the backend — raw bytes never stored in DB.
 */

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useTenantId } from "@/hooks/useTenantId";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  User,
  Car,
  Shield,
  CheckCircle2,
  Upload,
  AlertCircle,
  Clock,
  XCircle,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { RIDER_VEHICLE_TYPE } from "../../../drizzle/schema";

// ─────────────────────────────────────────────────────────────────────────────
// KYC Status Banner
// ─────────────────────────────────────────────────────────────────────────────

const KYC_STATUS_CONFIG = {
  PENDING: {
    icon: Clock,
    label: "Application Received",
    description: "Your application is queued for review.",
    color: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800",
    badge: "secondary" as const,
  },
  VERIFYING: {
    icon: Clock,
    label: "Verification In Progress",
    description: "Our KYC team is verifying your documents. This usually takes 1–3 business days.",
    color: "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800",
    badge: "secondary" as const,
  },
  ACTIVE: {
    icon: CheckCircle2,
    label: "Verification Complete",
    description: "Your identity has been verified. You can now accept delivery assignments.",
    color: "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
    badge: "default" as const,
  },
  REJECTED: {
    icon: XCircle,
    label: "Verification Failed",
    description: "Your application was not approved. Please contact support for details.",
    color: "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
    badge: "destructive" as const,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Form schema
// ─────────────────────────────────────────────────────────────────────────────

const personalInfoSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  phone: z.string().min(7, "Valid phone number is required"),
  address: z.string().min(5, "Address is required"),
  state: z.string().min(2, "State is required"),
  lga: z.string().min(2, "LGA is required"),
});

const vehicleSchema = z.object({
  vehicleType: z.enum(RIDER_VEHICLE_TYPE),
  plateNumber: z.string().min(4, "Plate number is required"),
  licenseExpiresAt: z.string().optional(),
});

const guarantorSchema = z.object({
  fullName: z.string().min(2, "Guarantor name is required"),
  phone: z.string().min(7, "Valid phone number is required"),
  address: z.string().min(5, "Address is required"),
  relationship: z.string().min(2, "Relationship is required"),
});

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
  "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
  "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun",
  "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

// ─────────────────────────────────────────────────────────────────────────────
// File → base64
// ─────────────────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step indicators
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Personal Info", icon: User },
  { label: "Vehicle & License", icon: Car },
  { label: "Guarantor", icon: Shield },
  { label: "Review", icon: CheckCircle2 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function RiderOnboarding() {
  const tenantId = useTenantId();
  const utils = trpc.useUtils();
  const [step, setStep] = useState(0);

  // Document file state
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [guarantorIdFile, setGuarantorIdFile] = useState<File | null>(null);
  const licenseInputRef = useRef<HTMLInputElement>(null);
  const guarantorIdInputRef = useRef<HTMLInputElement>(null);

  // Collected form data across steps
  const [personalData, setPersonalData] = useState<z.infer<typeof personalInfoSchema> | null>(null);
  const [vehicleData, setVehicleData] = useState<z.infer<typeof vehicleSchema> | null>(null);
  const [guarantorData, setGuarantorData] = useState<z.infer<typeof guarantorSchema> | null>(null);

  const personalForm = useForm<z.infer<typeof personalInfoSchema>>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: { fullName: "", phone: "", address: "", state: "", lga: "" },
  });

  const vehicleForm = useForm<z.infer<typeof vehicleSchema>>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { vehicleType: "BIKE", plateNumber: "", licenseExpiresAt: "" },
  });

  const guarantorForm = useForm<z.infer<typeof guarantorSchema>>({
    resolver: zodResolver(guarantorSchema),
    defaultValues: { fullName: "", phone: "", address: "", relationship: "" },
  });

  // Check if user already has an application
  const { data: existingApplication, isLoading: checkingApplication } =
    trpc.riders.getMyApplication.useQuery({ tenantId });

  const submitMutation = trpc.riders.submitApplication.useMutation({
    onSuccess: () => {
      utils.riders.getMyApplication.invalidate();
      toast.success("Application submitted!", {
        description: "Your KYC verification has started.",
      });
    },
    onError: (err) => {
      toast.error("Submission failed", { description: err.message });
    },
  });

  const handleFinalSubmit = async () => {
    if (!personalData || !vehicleData || !guarantorData) return;
    if (!licenseFile) {
      toast.error("License document required", {
        description: "Please upload a photo of your driver's license.",
      });
      return;
    }

    const licenseDocBase64 = await fileToBase64(licenseFile);
    let guarantorIdBase64: string | undefined;
    if (guarantorIdFile) {
      guarantorIdBase64 = await fileToBase64(guarantorIdFile);
    }

    submitMutation.mutate({
      tenantId,
      ...personalData,
      ...vehicleData,
      licenseDocBase64,
      guarantors: [{ ...guarantorData, idDocBase64: guarantorIdBase64 }],
    });
  };

  // ── If already has application, show status screen ───────────────────────
  if (checkingApplication) {
    return (
      <div className="max-w-lg mx-auto mt-12 space-y-4">
        <div className="h-32 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (existingApplication) {
    const statusKey = (existingApplication.rider.kycStatus ?? "PENDING") as keyof typeof KYC_STATUS_CONFIG;
    const config = KYC_STATUS_CONFIG[statusKey] ?? KYC_STATUS_CONFIG.PENDING;
    const StatusIcon = config.icon;

    return (
      <div className="max-w-lg mx-auto mt-8 space-y-6" data-testid="kyc-status-screen">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rider Application</h1>
          <p className="text-muted-foreground text-sm mt-1">KYC verification status</p>
        </div>

        <Card className={`border-2 ${config.color}`}>
          <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
            <StatusIcon className="h-10 w-10" data-testid="status-icon" />
            <div>
              <p className="font-semibold text-lg">{config.label}</p>
              <p className="text-muted-foreground text-sm mt-1">{config.description}</p>
            </div>
            <Badge variant={config.badge} data-testid="status-badge">
              {statusKey}
            </Badge>
            {existingApplication.rider.rejectionReason && (
              <div className="flex items-start gap-2 text-left text-sm text-destructive bg-destructive/10 rounded-lg p-3 w-full">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{existingApplication.rider.rejectionReason}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Multi-step form ──────────────────────────────────────────────────────
  const progressPct = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="max-w-lg mx-auto mt-8 space-y-6" data-testid="rider-onboarding">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rider Onboarding</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Complete all steps to start accepting deliveries
        </p>
      </div>

      {/* Step indicator */}
      <div className="space-y-3">
        <Progress value={progressPct} className="h-2" data-testid="onboarding-progress" />
        <div className="flex justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    i < step
                      ? "bg-primary text-primary-foreground"
                      : i === step
                        ? "bg-primary/10 text-primary border-2 border-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < step ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className="text-xs text-muted-foreground hidden sm:block">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Step 0: Personal Information ────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" /> Personal Information
            </CardTitle>
            <CardDescription>Basic contact and residential details</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...personalForm}>
              <form
                onSubmit={personalForm.handleSubmit((data) => {
                  setPersonalData(data);
                  setStep(1);
                })}
                className="space-y-4"
              >
                <FormField
                  control={personalForm.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Legal Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Emeka Okafor" data-testid="input-fullName" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={personalForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+234 800 000 0000" data-testid="input-phone" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={personalForm.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Residential Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="22 Bode Thomas Street, Surulere"
                          data-testid="input-address"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={personalForm.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-state">
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {NIGERIAN_STATES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={personalForm.control}
                    name="lga"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>LGA</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Surulere" data-testid="input-lga" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full" data-testid="button-next-personal">
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Vehicle & License ────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" /> Vehicle & License
            </CardTitle>
            <CardDescription>
              Upload your driver's license document (image only — no license number is collected)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...vehicleForm}>
              <form
                onSubmit={vehicleForm.handleSubmit((data) => {
                  if (!licenseFile) {
                    toast.error("License document required", {
                      description: "Please upload a photo of your driver's license.",
                    });
                    return;
                  }
                  setVehicleData(data);
                  setStep(2);
                })}
                className="space-y-4"
              >
                <FormField
                  control={vehicleForm.control}
                  name="vehicleType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-vehicleType">
                            <SelectValue placeholder="Select vehicle type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RIDER_VEHICLE_TYPE.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={vehicleForm.control}
                  name="plateNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plate Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. LSD-123AA"
                          data-testid="input-plateNumber"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={vehicleForm.control}
                  name="licenseExpiresAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>License Expiry Date (optional)</FormLabel>
                      <FormControl>
                        <Input type="date" data-testid="input-licenseExpiresAt" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* License document upload */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Driver's License Document</label>
                  <p className="text-xs text-muted-foreground">
                    Upload a clear photo of your license. The document number is not collected.
                  </p>
                  <input
                    ref={licenseInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    data-testid="input-licenseDoc"
                    onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    data-testid="button-upload-license"
                    onClick={() => licenseInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    {licenseFile ? licenseFile.name : "Upload License Photo"}
                  </Button>
                  {licenseFile && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      ✓ {licenseFile.name} selected
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    data-testid="button-back-vehicle"
                    onClick={() => setStep(0)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <Button type="submit" className="flex-1" data-testid="button-next-vehicle">
                    Continue <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Guarantor ────────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" /> Guarantor Details
            </CardTitle>
            <CardDescription>
              Provide details of someone who can vouch for you
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...guarantorForm}>
              <form
                onSubmit={guarantorForm.handleSubmit((data) => {
                  setGuarantorData(data);
                  setStep(3);
                })}
                className="space-y-4"
              >
                <FormField
                  control={guarantorForm.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guarantor Full Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Chidi Okeke"
                          data-testid="input-guarantor-fullName"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={guarantorForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guarantor Phone</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="+234 800 000 0001"
                          data-testid="input-guarantor-phone"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={guarantorForm.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guarantor Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Guarantor's residential address"
                          data-testid="input-guarantor-address"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={guarantorForm.control}
                  name="relationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Employer, Family Friend"
                          data-testid="input-guarantor-relationship"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Optional guarantor ID upload */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Guarantor ID Document{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    ref={guarantorIdInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    data-testid="input-guarantorId"
                    onChange={(e) => setGuarantorIdFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    data-testid="button-upload-guarantorId"
                    onClick={() => guarantorIdInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    {guarantorIdFile ? guarantorIdFile.name : "Upload Guarantor ID (optional)"}
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    data-testid="button-back-guarantor"
                    onClick={() => setStep(1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <Button type="submit" className="flex-1" data-testid="button-next-guarantor">
                    Continue <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Review & Submit ──────────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" /> Review & Submit
            </CardTitle>
            <CardDescription>
              Check your details before submitting. Your license document will be uploaded securely.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Personal */}
            <div className="bg-muted/40 rounded-lg p-4 space-y-1 text-sm">
              <p className="font-semibold mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Personal
              </p>
              <p>
                <span className="font-medium">Name:</span> {personalData?.fullName}
              </p>
              <p>
                <span className="font-medium">Phone:</span> {personalData?.phone}
              </p>
              <p>
                <span className="font-medium">Address:</span> {personalData?.address}
              </p>
              <p>
                <span className="font-medium">State / LGA:</span> {personalData?.state} /{" "}
                {personalData?.lga}
              </p>
            </div>

            {/* Vehicle */}
            <div className="bg-muted/40 rounded-lg p-4 space-y-1 text-sm">
              <p className="font-semibold mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Vehicle
              </p>
              <p>
                <span className="font-medium">Type:</span> {vehicleData?.vehicleType}
              </p>
              <p>
                <span className="font-medium">Plate:</span> {vehicleData?.plateNumber}
              </p>
              <p>
                <span className="font-medium">License doc:</span>{" "}
                {licenseFile ? licenseFile.name : "—"}
              </p>
            </div>

            {/* Guarantor */}
            <div className="bg-muted/40 rounded-lg p-4 space-y-1 text-sm">
              <p className="font-semibold mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Guarantor
              </p>
              <p>
                <span className="font-medium">Name:</span> {guarantorData?.fullName}
              </p>
              <p>
                <span className="font-medium">Phone:</span> {guarantorData?.phone}
              </p>
              <p>
                <span className="font-medium">Relationship:</span> {guarantorData?.relationship}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                data-testid="button-back-review"
                onClick={() => setStep(2)}
                disabled={submitMutation.isPending}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                type="button"
                className="flex-1"
                data-testid="button-submit-application"
                onClick={handleFinalSubmit}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? "Submitting…" : "Submit Application"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
