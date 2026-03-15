/**
 * Create Parcel Page [Part 10.4]
 * Offline-capable: when offline, saves to IndexedDB and queues the mutation.
 * Nigeria First: NGN default currency, Nigerian states list.
 * Mobile-first: single-column form optimised for touch input.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Package, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";
import { useTenantId } from "@/hooks/useTenantId";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { trpc } from "@/lib/trpc";
import {
  enqueueMutation,
  generateClientId,
  saveOfflineParcel,
} from "@/lib/offlineDb";

// Nigeria's 36 states + FCT [Part 9.1 — Nigeria First]
const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
  "FCT - Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
  "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo",
  "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

// Supported currencies [Part 9.1 — Africa First]
const CURRENCIES = [
  { code: "NGN", label: "Nigerian Naira (₦)" },
  { code: "GHS", label: "Ghanaian Cedi (₵)" },
  { code: "KES", label: "Kenyan Shilling (KSh)" },
  { code: "ZAR", label: "South African Rand (R)" },
  { code: "USD", label: "US Dollar ($)" },
];

const formSchema = z.object({
  senderName: z.string().min(1, "Sender name is required"),
  senderPhone: z.string().min(7, "Valid phone number required"),
  senderAddress: z.string().min(1, "Sender address is required"),
  recipientName: z.string().min(1, "Recipient name is required"),
  recipientPhone: z.string().min(7, "Valid phone number required"),
  recipientAddress: z.string().min(1, "Recipient address is required"),
  recipientCity: z.string().min(1, "City is required"),
  recipientState: z.string().min(1, "State is required"),
  description: z.string().optional(),
  weightGrams: z.coerce.number().int().min(0).default(0),
  deliveryFeeNaira: z.coerce.number().min(0).default(0),
  currency: z.string().default("NGN"),
  priority: z.enum(["STANDARD", "EXPRESS", "SAME_DAY"]).default("STANDARD"),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateParcel() {
  const { t } = useI18n();
  const tenantId = useTenantId();
  const isOnline = useOnlineStatus();
  const [, setLocation] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createMutation = trpc.parcels.create.useMutation({
    onSuccess: data => {
      toast.success(`${t.success} — ${data.data?.trackingNumber}`);
      setLocation("/parcels");
    },
    onError: err => {
      toast.error(err.message || t.error);
      setIsSubmitting(false);
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      currency: "NGN",
      priority: "STANDARD",
      weightGrams: 0,
      deliveryFeeNaira: 0,
    },
  });

  const currency = watch("currency");

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const clientId = generateClientId();
    // Convert naira to kobo [Part 9.2]
    const deliveryFeeKobo = Math.round(values.deliveryFeeNaira * 100);

    if (!isOnline) {
      // Offline: save to IndexedDB and enqueue mutation [Part 6, CORE-1]
      const localId = await saveOfflineParcel({
        clientId,
        tenantId,
        status: "PENDING",
        priority: values.priority,
        senderName: values.senderName,
        senderPhone: values.senderPhone,
        senderAddress: values.senderAddress,
        recipientName: values.recipientName,
        recipientPhone: values.recipientPhone,
        recipientAddress: values.recipientAddress,
        recipientCity: values.recipientCity,
        recipientState: values.recipientState,
        description: values.description,
        weightGrams: values.weightGrams,
        deliveryFeeKobo,
        insuranceValueKobo: 0,
        currency: values.currency,
        synced: false,
        createdAt: Date.now(),
      });

      await enqueueMutation("parcels.create", {
        localId,
        clientId,
        tenantId,
        ...values,
        deliveryFeeKobo,
        insuranceValueKobo: 0,
      });

      toast.success(t.offline);
      setLocation("/parcels");
      return;
    }

    createMutation.mutate({
      tenantId,
      senderName: values.senderName,
      senderPhone: values.senderPhone,
      senderAddress: values.senderAddress,
      recipientName: values.recipientName,
      recipientPhone: values.recipientPhone,
      recipientAddress: values.recipientAddress,
      recipientCity: values.recipientCity,
      recipientState: values.recipientState,
      description: values.description,
      weightGrams: values.weightGrams,
      deliveryFeeKobo,
      insuranceValueKobo: 0,
      currency: values.currency,
      priority: values.priority,
      clientId,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/parcels")}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{t.newParcel}</h1>
          {!isOnline && (
            <p className="text-xs text-orange-600 flex items-center gap-1 mt-0.5">
              <WifiOff className="h-3 w-3" />
              Offline — will sync when connected
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit as unknown as Parameters<typeof handleSubmit>[0])} className="space-y-4">
        {/* Sender Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              {t.sender}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="senderName">{t.sender} {t.parcels.slice(0, -1)} Name *</Label>
              <Input
                id="senderName"
                {...register("senderName")}
                placeholder="Full name"
                className={errors.senderName ? "border-destructive" : ""}
              />
              {errors.senderName && (
                <p className="text-xs text-destructive">{errors.senderName.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="senderPhone">{t.phone} *</Label>
                <Input
                  id="senderPhone"
                  type="tel"
                  {...register("senderPhone")}
                  placeholder="+234 800 000 0000"
                  className={errors.senderPhone ? "border-destructive" : ""}
                />
                {errors.senderPhone && (
                  <p className="text-xs text-destructive">{errors.senderPhone.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senderAddress">{t.address} *</Label>
              <Textarea
                id="senderAddress"
                {...register("senderAddress")}
                placeholder="Full pickup address"
                rows={2}
                className={errors.senderAddress ? "border-destructive" : ""}
              />
              {errors.senderAddress && (
                <p className="text-xs text-destructive">{errors.senderAddress.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recipient Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.recipient}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="recipientName">{t.recipient} Name *</Label>
              <Input
                id="recipientName"
                {...register("recipientName")}
                placeholder="Full name"
                className={errors.recipientName ? "border-destructive" : ""}
              />
              {errors.recipientName && (
                <p className="text-xs text-destructive">{errors.recipientName.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipientPhone">{t.phone} *</Label>
              <Input
                id="recipientPhone"
                type="tel"
                {...register("recipientPhone")}
                placeholder="+234 800 000 0000"
                className={errors.recipientPhone ? "border-destructive" : ""}
              />
              {errors.recipientPhone && (
                <p className="text-xs text-destructive">{errors.recipientPhone.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipientAddress">{t.address} *</Label>
              <Textarea
                id="recipientAddress"
                {...register("recipientAddress")}
                placeholder="Full delivery address"
                rows={2}
                className={errors.recipientAddress ? "border-destructive" : ""}
              />
              {errors.recipientAddress && (
                <p className="text-xs text-destructive">{errors.recipientAddress.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="recipientCity">{t.city} *</Label>
                <Input
                  id="recipientCity"
                  {...register("recipientCity")}
                  placeholder="Lagos"
                  className={errors.recipientCity ? "border-destructive" : ""}
                />
                {errors.recipientCity && (
                  <p className="text-xs text-destructive">{errors.recipientCity.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recipientState">{t.state} *</Label>
                <Select
                  onValueChange={val => setValue("recipientState", val)}
                  defaultValue=""
                >
                  <SelectTrigger
                    id="recipientState"
                    className={errors.recipientState ? "border-destructive" : ""}
                  >
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {NIGERIAN_STATES.map(s => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.recipientState && (
                  <p className="text-xs text-destructive">{errors.recipientState.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parcel Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.description}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="description">{t.description}</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="What's in the parcel?"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="weightGrams">{t.weight}</Label>
                <Input
                  id="weightGrams"
                  type="number"
                  min="0"
                  {...register("weightGrams")}
                  placeholder="500"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="priority">{t.priority}</Label>
                <Select
                  onValueChange={val => setValue("priority", val as "STANDARD" | "EXPRESS" | "SAME_DAY")}
                  defaultValue="STANDARD"
                >
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD">{t.STANDARD}</SelectItem>
                    <SelectItem value="EXPRESS">{t.EXPRESS}</SelectItem>
                    <SelectItem value="SAME_DAY">{t.SAME_DAY}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.deliveryFee}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="currency">{t.currency}</Label>
                <Select
                  onValueChange={val => setValue("currency", val)}
                  defaultValue="NGN"
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deliveryFeeNaira">
                  {t.deliveryFee} ({currency})
                </Label>
                <Input
                  id="deliveryFeeNaira"
                  type="number"
                  min="0"
                  step="0.01"
                  {...register("deliveryFeeNaira")}
                  placeholder="0.00"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* NDPR Notice [Part 9.1 — Nigeria First] */}
        <p className="text-xs text-muted-foreground px-1">{t.ndprNotice}</p>

        {/* Submit */}
        <div className="flex gap-3 pb-20">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setLocation("/parcels")}
          >
            {t.cancel}
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={isSubmitting || createMutation.isPending}
          >
            {isSubmitting || createMutation.isPending ? t.loading : t.create}
          </Button>
        </div>
      </form>
    </div>
  );
}
