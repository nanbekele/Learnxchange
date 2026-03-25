import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, X, FileText, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const CreateCourse = () => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("other");
  const [availability, setAvailability] = useState("sale");
  const [loading, setLoading] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [tocFile, setTocFile] = useState<File | null>(null);
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const thumbnailRef = useRef<HTMLInputElement>(null);
  const tocRef = useRef<HTMLInputElement>(null);
  const materialsRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setThumbnailFile(file);
      setThumbnailPreview(URL.createObjectURL(file));
    }
  };

  const handleMaterialsSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setMaterialFiles((prev) => [...prev, ...files]);
  };

  const handleTocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setTocFile(file);
  };

  const removeMaterial = (index: number) => {
    setMaterialFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    if (!tocFile) {
      toast({
        title: "Add table of contents",
        description: "Please upload a table of contents file so users can review the course before buying/exchanging.",
        variant: "destructive",
      });
      return;
    }

    if (materialFiles.length === 0) {
      toast({
        title: "Add course content",
        description: "Please upload at least one course material file before publishing this course.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      let thumbnail_url: string | null = null;
      let toc_url: string | null = null;

      // Upload thumbnail
      if (thumbnailFile) {
        const ext = thumbnailFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("course-thumbnails")
          .upload(path, thumbnailFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage
          .from("course-thumbnails")
          .getPublicUrl(path);
        thumbnail_url = urlData.publicUrl;
      }

      // Upload table of contents (public/free)
      {
        const path = `${user.id}/${Date.now()}-${tocFile.name}`;
        const { error: tocUploadErr } = await supabase.storage
          .from("course-tocs")
          .upload(path, tocFile);
        if (tocUploadErr) throw tocUploadErr;
        const { data: tocUrlData } = supabase.storage
          .from("course-tocs")
          .getPublicUrl(path);
        toc_url = tocUrlData.publicUrl;
      }

      // Insert course
      const { data: course, error: courseErr } = await supabase
        .from("courses")
        .insert({
          title: title.trim(),
          description: description.trim(),
          price: parseFloat(price) || 0,
          category,
          availability,
          user_id: user.id,
          thumbnail_url,
          toc_url,
        })
        .select()
        .single();

      if (courseErr) throw courseErr;

      // Upload materials
      for (const file of materialFiles) {
        const path = `${user.id}/${course.id}/${Date.now()}-${file.name}`;
        const { error: matUploadErr } = await supabase.storage
          .from("course-materials")
          .upload(path, file);
        if (matUploadErr) {
          console.error("Material upload error:", matUploadErr);
          continue;
        }
        await supabase.from("course_materials").insert({
          course_id: course.id,
          file_name: file.name,
          file_url: path,
          file_type: file.type,
          file_size: file.size,
        });
      }

      toast({ title: "Course created successfully!" });
      router.push("/my-courses");
    } catch (err: any) {
      toast({ title: "Error creating course", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl font-bold text-foreground">Create a Course</h1>
        <p className="mt-1 text-muted-foreground">Share your knowledge with the community</p>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Course Title</Label>
                <Input id="title" placeholder="e.g. Introduction to Python" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Describe your course content..." rows={4} value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="price">Price (ETB)</Label>
                  <Input id="price" type="number" min="0" step="0.01" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="programming">Programming</SelectItem>
                      <SelectItem value="design">Design</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="language">Language</SelectItem>
                      <SelectItem value="science">Science</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Availability</Label>
                <Select value={availability} onValueChange={setAvailability}>
                  <SelectTrigger><SelectValue placeholder="Select availability type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">For Sale</SelectItem>
                    <SelectItem value="exchange">For Exchange</SelectItem>
                    <SelectItem value="both">Both (Sale & Exchange)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Thumbnail */}
              <div className="space-y-2">
                <Label>Thumbnail Image</Label>
                <input ref={thumbnailRef} type="file" accept="image/*" className="hidden" onChange={handleThumbnailSelect} />
                {thumbnailPreview ? (
                  <div className="relative overflow-hidden rounded-lg border border-border">
                    <img src={thumbnailPreview} alt="Thumbnail preview" className="h-40 w-full object-cover" />
                    <button type="button" onClick={() => { setThumbnailFile(null); setThumbnailPreview(null); }} className="absolute right-2 top-2 rounded-full bg-background/80 p-1 backdrop-blur-sm">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div onClick={() => thumbnailRef.current?.click()} className="flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors">
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground" />
                      <p className="mt-1 text-sm text-muted-foreground">Click to upload thumbnail</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Table of Contents (public/free) */}
              <div className="space-y-2">
                <Label>Table of Contents File</Label>
                <input ref={tocRef} type="file" className="hidden" onChange={handleTocSelect} />
                <div onClick={() => tocRef.current?.click()} className="flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors">
                  <div className="text-center">
                    <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-1 text-sm text-muted-foreground">Upload your table of contents (PDF, image, doc)</p>
                  </div>
                </div>
                {tocFile && (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate max-w-[200px]">{tocFile.name}</span>
                      <span className="text-muted-foreground">({(tocFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                    </div>
                    <button type="button" onClick={() => setTocFile(null)}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
                  </div>
                )}
              </div>

              {/* Materials */}
              <div className="space-y-2">
                <Label>Course Materials</Label>
                <input ref={materialsRef} type="file" multiple className="hidden" onChange={handleMaterialsSelect} />
                <div onClick={() => materialsRef.current?.click()} className="flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors">
                  <div className="text-center">
                    <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-1 text-sm text-muted-foreground">Upload PDFs, videos, docs</p>
                  </div>
                </div>
                {materialFiles.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {materialFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2">
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate max-w-[200px]">{file.name}</span>
                          <span className="text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                        </div>
                        <button type="button" onClick={() => removeMaterial(i)}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Course
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default CreateCourse;
