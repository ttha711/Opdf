import { OPS } from "pdfjs-dist";
import { describe, expect, it } from "vitest";
import { extractPdfPathSegments, snapToVector, applyMatrix, type SnapOptions } from "./cadVectorSnap";
const enabled: SnapOptions={endpoint:true,midpoint:true,intersection:true,path:true};

describe("vector CAD snap",()=>{
  it("extracts only stroked vector segments, including rectangles",()=>{
    const geometry=extractPdfPathSegments({
      fnArray:[OPS.constructPath,OPS.fill,OPS.constructPath,OPS.stroke],
      argsArray:[
        [[OPS.moveTo,OPS.lineTo],[0,0,10,0]],
        [],
        [[OPS.rectangle],[2,3,8,7]],
        [],
      ],
    });
    expect(geometry.segments).toHaveLength(4);
    expect(geometry.segments[0]).toEqual({a:{x:2,y:3},b:{x:10,y:3}});
  });
  it("applies nested affine transforms and restores graphics state",()=>{
    const geometry=extractPdfPathSegments({
      fnArray:[OPS.save,OPS.transform,OPS.constructPath,OPS.stroke,OPS.restore,OPS.constructPath,OPS.stroke],
      argsArray:[[],[2,0,0,2,10,20],[[OPS.moveTo,OPS.lineTo],[0,0,5,0]],[],[],[[OPS.moveTo,OPS.lineTo],[0,0,5,0]],[]],
    });
    expect(geometry.segments).toEqual([
      {a:{x:10,y:20},b:{x:20,y:20}},
      {a:{x:0,y:0},b:{x:5,y:0}},
    ]);
    expect(applyMatrix([0,1,-1,0,200,0],{x:10,y:20})).toEqual({x:180,y:10});
  });
  it("snaps endpoints, midpoints, path feet and true intersections",()=>{
    const segments=[
      {a:{x:0,y:0},b:{x:20,y:0}},
      {a:{x:10,y:-10},b:{x:10,y:10}},
    ];
    expect(snapToVector(segments,{x:0.4,y:0.3},2,enabled)?.kind).toBe("endpoint");
    expect(snapToVector(segments,{x:10.1,y:0.1},2,enabled)?.kind).toBe("intersection");
    expect(snapToVector(segments,{x:10.2,y:0.5},2,{...enabled,intersection:false,path:false})?.kind).toBe("midpoint");
    expect(snapToVector([segments[0]],{x:7,y:1},2,{...enabled,endpoint:false,midpoint:false,intersection:false})?.point).toEqual({x:7,y:0});
    expect(snapToVector(segments,{x:55,y:55},4,enabled)).toBeNull();
  });
  it("rejects guessed Bezier geometry and bounds huge pages",()=>{
    const geometry=extractPdfPathSegments({
      fnArray:[OPS.constructPath,OPS.stroke,OPS.constructPath,OPS.stroke],
      argsArray:[[[OPS.moveTo,OPS.curveTo],[0,0,0,1,1,1,2,0]],[],[[OPS.rectangle],[0,0,5,5]],[]],
    },2);
    expect(geometry.unsupportedCurves).toBe(true);
    expect(geometry.truncated).toBe(true);
    expect(geometry.segments).toHaveLength(2);
  });
});
