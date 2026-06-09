שינוי צבע אייקון "לא בשימור" לירוק

בקובץ `src/components/PlotPicker.tsx` שורות 781-784:
- נוסיף ל-`MinusCircle` className: `text-emerald-600 dark:text-emerald-400`
- הטקסט "לא בשימור" יישאר בצבע המקורי (text-muted-foreground)

למשל:
```tsx
<MinusCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
```